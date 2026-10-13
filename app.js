'use strict';

// ---------- Données ----------

const CATEGORIES = [
  { id: 'travail', name: 'Travail', color: '#5b8def' },
  { id: 'sport', name: 'Sport', color: '#34c759' },
  { id: 'social', name: 'Social', color: '#ff9f0a' },
  { id: 'loisirs', name: 'Loisirs', color: '#af52de' },
  { id: 'maison', name: 'Maison', color: '#a2845e' },
  { id: 'sante', name: 'Santé', color: '#ff375f' },
  { id: 'autre', name: 'Autre', color: '#8e8e93' },
];
const cat = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

const STORAGE_KEY = 'ma-semaine-v1';

const DEFAULT_IDEAS = [
  { title: 'Course à pied', category: 'sport', duration: 45 },
  { title: 'Séance de sport', category: 'sport', duration: 60 },
  { title: 'Dîner entre amis', category: 'social', duration: 120 },
  { title: 'Appeler la famille', category: 'social', duration: 30 },
  { title: 'Cinéma', category: 'loisirs', duration: 150 },
  { title: 'Lecture', category: 'loisirs', duration: 45 },
  { title: 'Courses de la semaine', category: 'maison', duration: 60 },
  { title: 'Ménage', category: 'maison', duration: 60 },
  { title: 'Méditation', category: 'sante', duration: 15 },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const EMPTY_HEALTH = () => ({ food: [], steps: {}, weights: [], profile: {}, customFoods: {}, settings: {}, routines: [], learn: { dismissed: {}, rejected: {} } });
const withDefaults = d => ({ ...EMPTY_HEALTH(), ...d });

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return withDefaults(JSON.parse(raw));
  } catch (e) { /* données illisibles : on repart de zéro */ }
  return withDefaults({ events: [], ideas: DEFAULT_IDEAS.map(i => ({ id: uid(), notes: '', ...i })) });
}

let data = load();
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ---------- Dates (toujours en heure locale) ----------

const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
function startOfWeek(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(r, -((r.getDay() + 6) % 7)); // lundi
}
const fmtDay = d => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
const fmtShort = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
function fmtDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}

// ---------- État de l'interface ----------

const state = {
  tab: 'week',
  weekStart: startOfWeek(new Date()),
  ideaFilter: 'all',
  suggestion: null,
  healthDate: toISO(new Date()),
  stepsPending: false,
  weightTip: null,
  proposals: [],
  todayDismissed: false,
};

const view = document.getElementById('view');
const sheet = document.getElementById('sheet');
const sheetForm = document.getElementById('sheet-form');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2300);
}

function render() {
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  if (state.tab === 'week') renderWeek();
  else if (state.tab === 'ideas') renderIdeas();
  else if (state.tab === 'health') renderHealth();
  else renderSettings();
}

// ---------- Onglet Semaine ----------

function eventsOn(iso) {
  return data.events.filter(e => e.date === iso).sort((a, b) => a.start.localeCompare(b.start));
}

function renderWeek() {
  const start = state.weekStart;
  const end = addDays(start, 6);
  const todayISO = toISO(new Date());
  const isCurrent = toISO(start) === toISO(startOfWeek(new Date()));
  const isPast = toISO(end) < todayISO;
  materializeRoutines(start);
  const proposals = state.proposals.filter(p => p.date >= toISO(start) && p.date <= toISO(end));

  const weekEvents = data.events.filter(e => e.date >= toISO(start) && e.date <= toISO(end));
  const totals = {};
  weekEvents.forEach(e => { totals[e.category] = (totals[e.category] || 0) + (toMin(e.end) - toMin(e.start)); });

  let html = `
    <div class="header">
      <h1>${isCurrent ? 'Cette semaine' : 'Semaine'}</h1>
      <div class="week-nav">
        ${isCurrent ? '' : '<button class="text-btn" data-action="today">Aujourd\'hui</button>'}
        <button class="icon-btn" data-action="prev" aria-label="Semaine précédente">‹</button>
        <button class="icon-btn" data-action="next" aria-label="Semaine suivante">›</button>
      </div>
    </div>
    <p class="subtitle">Du ${fmtShort(start)} au ${fmtShort(end)} · ${weekEvents.length} activité${weekEvents.length > 1 ? 's' : ''}</p>`;

  if (isCurrent) html += renderToday();

  const detected = isPast ? null : detectRoutines()[0];
  if (detected) {
    html += `
      <div class="suggestion">
        <div class="label">🧠 J'ai remarqué une habitude</div>
        <div class="idea-title" style="margin:4px 0 2px">${esc(detected.title)}</div>
        <div class="idea-meta" style="margin-bottom:10px">${daysLabel(detected.days)} vers ${detected.start} · ${fmtDuration(toMin(detected.end) - toMin(detected.start))}</div>
        <div class="row">
          <button class="secondary" data-action="routine-no" data-key="${esc(detected.key)}">Non merci</button>
          <button class="primary" data-action="routine-yes" data-key="${esc(detected.key)}">En faire une routine</button>
        </div>
      </div>`;
  }

  if (!isPast) {
    html += proposals.length
      ? `<div class="row-buttons"><button class="primary" data-action="props-all">✓ Tout accepter (${proposals.length})</button><button class="secondary" data-action="props-clear">Effacer</button></div>`
      : '<button class="secondary" data-action="propose-week">✨ Proposer ma semaine</button>';
  }

  const totalEntries = Object.entries(totals);
  if (totalEntries.length) {
    html += `<div class="chips">${totalEntries.map(([c, m]) =>
      `<span class="chip"><span class="dot" style="background:${cat(c).color}"></span>${cat(c).name} · ${fmtDuration(m)}</span>`).join('')}</div>`;
  }

  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const iso = toISO(d);
    const items = [...eventsOn(iso), ...proposals.filter(p => p.date === iso).map(p => ({ ...p, proposal: true }))]
      .sort((a, b) => a.start.localeCompare(b.start));
    html += `
      <section class="day ${iso === todayISO ? 'today' : ''}">
        <div class="day-head">
          <span class="day-title">${fmtDay(d)}</span>
          <button class="day-add" data-action="add" data-date="${iso}" aria-label="Ajouter">+</button>
        </div>
        ${items.length ? `<div class="day-list">${items.map(e => e.proposal ? `
          <div class="event ghost">
            <span class="bar" style="background:${cat(e.category).color}"></span>
            <span class="time">${e.start}<br>${e.end}</span>
            <span class="grow"><div class="title">✨ ${esc(e.title)}</div><div class="note">Suggestion</div></span>
            <button class="mini no" data-action="prop-no" data-id="${e.id}" aria-label="Refuser">✕</button>
            <button class="mini ok" data-action="prop-ok" data-id="${e.id}" aria-label="Accepter">✓</button>
          </div>` : `
          <button class="event ${e.done ? 'done' : ''}" data-action="edit" data-id="${e.id}">
            <span class="bar" style="background:${cat(e.category).color}"></span>
            <span class="time">${e.start}<br>${e.end}</span>
            <span><div class="title">${esc(e.title)}${e.routineId ? ' <span class="routine-icon" title="Routine">↻</span>' : ''}</div>${e.notes ? `<div class="note">${esc(e.notes)}</div>` : ''}</span>
          </button>`).join('')}</div>` : '<div class="empty">Rien de prévu</div>'}
      </section>`;
  }
  view.innerHTML = html;
}

// Carte « Aujourd'hui » : en cours / à suivre, activités passées à cocher, créneau libre à remplir
function renderToday() {
  const iso = toISO(new Date());
  const now = nowMinutes();
  const evs = eventsOn(iso);
  const current = evs.find(e => toMin(e.start) <= now && toMin(e.end) > now);
  const next = evs.find(e => toMin(e.start) > now);
  const toCheck = evs.filter(e => toMin(e.end) <= now && !e.done);
  // Pas de suggestion ici si la semaine proposée couvre déjà aujourd'hui
  const free = state.todayDismissed || state.proposals.some(p => p.date === iso) ? null : nextFreeSlotToday();
  if (!current && !next && !toCheck.length && !free) return '';
  let html = '<div class="card today-card"><div class="label">Aujourd\'hui</div>';
  if (current) html += `<div class="today-row"><b>En cours</b> · ${esc(current.title)} jusqu'à ${current.end}</div>`;
  if (next) html += `<div class="today-row"><b>Ensuite</b> · ${esc(next.title)} à ${next.start}</div>`;
  toCheck.forEach(e => {
    html += `<div class="today-row check"><span>Fait : ${esc(e.title)} ?</span><button class="mini ok" data-action="mark-done" data-id="${e.id}" aria-label="Fait">✓</button></div>`;
  });
  if (free) {
    html += `<div class="today-row free">
      <span>Libre ${fromMin(free.slot[0])}–${fromMin(free.slot[1])} · <b>${esc(free.idea.title)}</b> à ${fromMin(free.start)} ?</span>
      <button class="mini no" data-action="today-no" data-id="${free.idea.id}" aria-label="Non">✕</button>
      <button class="mini ok" data-action="today-yes" data-id="${free.idea.id}" data-start="${free.start}" aria-label="Ajouter">✓</button>
    </div>`;
  }
  return html + '</div>';
}

function acceptProposal(p) {
  const idea = data.ideas.find(i => i.id === p.ideaId);
  data.events.push({ id: uid(), title: p.title, date: p.date, start: p.start, end: p.end, category: p.category, notes: idea ? idea.notes || '' : '', done: false });
  state.proposals = state.proposals.filter(x => x.id !== p.id);
}

function rejectIdea(title) {
  const k = norm(title);
  learn().rejected[k] = (learn().rejected[k] || 0) + 1;
}

// ---------- Onglet Activités ----------

function plannedThisWeek(title) {
  const s = toISO(state.weekStart), e = toISO(addDays(state.weekStart, 6));
  return data.events.some(ev => ev.title === title && ev.date >= s && ev.date <= e);
}

// Suggestion selon tes habitudes : tirage parmi les 3 idées les mieux notées pour aujourd'hui
function suggest() {
  const iso = defaultPlanDate();
  const pool = data.ideas
    .filter(i => (state.ideaFilter === 'all' || i.category === state.ideaFilter) && i.id !== state.suggestion)
    .map(i => ({ i, s: scoreIdea(i, iso, nowMinutes()) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3);
  const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)].i : data.ideas.find(i => i.id === state.suggestion);
  state.suggestion = pick ? pick.id : null;
  if (!pick) toast('Ajoute d\'abord des idées d\'activités');
  render();
}

function renderIdeas() {
  const ideas = data.ideas
    .filter(i => state.ideaFilter === 'all' || i.category === state.ideaFilter)
    .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  const sug = data.ideas.find(i => i.id === state.suggestion);

  let html = `
    <div class="header">
      <h1>Activités</h1>
      <button class="icon-btn" data-action="new-idea" aria-label="Nouvelle idée">+</button>
    </div>
    <p class="subtitle">Ta banque d'idées pour remplir la semaine</p>
    <div class="chips">
      <button class="chip selectable ${state.ideaFilter === 'all' ? 'active' : ''}" data-action="filter" data-cat="all">Toutes</button>
      ${CATEGORIES.map(c => `<button class="chip selectable ${state.ideaFilter === c.id ? 'active' : ''}" data-action="filter" data-cat="${c.id}"><span class="dot" style="background:${c.color}"></span>${c.name}</button>`).join('')}
    </div>`;

  if (sug) {
    html += `
      <div class="suggestion">
        <div class="label">Et si tu faisais…</div>
        <div class="idea-title">${esc(sug.title)}</div>
        <div class="idea-meta" style="margin:-6px 0 12px">${cat(sug.category).name} · ${fmtDuration(sug.duration)}</div>
        <div class="row">
          <button class="secondary" data-action="suggest">Autre idée</button>
          <button class="primary" data-action="plan" data-id="${sug.id}">Planifier</button>
        </div>
      </div>`;
  } else {
    html += `<button class="primary" data-action="suggest">🎲 Propose-moi une activité</button>`;
  }

  html += ideas.length ? `<div class="list">${ideas.map(i => `
    <div class="idea">
      <span class="dot" style="background:${cat(i.category).color}"></span>
      <button class="idea-main" data-action="edit-idea" data-id="${i.id}">
        <div class="idea-title">${esc(i.title)}</div>
        <div class="idea-meta">${cat(i.category).name} · ${fmtDuration(i.duration)}${plannedThisWeek(i.title) ? ' · ✓ cette semaine' : ''}</div>
      </button>
      <button class="plan-btn" data-action="plan" data-id="${i.id}">Planifier</button>
    </div>`).join('')}</div>` : '<p class="help">Aucune idée dans cette catégorie. Appuie sur + pour en ajouter.</p>';

  view.innerHTML = html;
}

// ---------- Onglet Réglages ----------

function renderSettings() {
  const p = data.profile;
  view.innerHTML = `
    <div class="header"><h1>Réglages</h1></div>
    <div class="section-title">Profil (pour l'objectif calorique)</div>
    <button class="secondary" data-action="profile">${profileComplete() ? `${p.sex === 'f' ? 'Femme' : 'Homme'} · ${p.age} ans · ${p.height} cm` : 'Renseigner mon profil'}</button>
    <div class="section-title">Rappel du dimanche</div>
    <button class="secondary" data-action="enable-push">${data.settings.pushSub ? 'Voir mon code de notification' : 'Activer les notifications'}</button>
    <p class="help">Chaque dimanche matin, une notification te rappelle de te peser. La mise en route (une seule fois) est expliquée dans le README.</p>
    <div class="section-title">Pas (app Santé)</div>
    <button class="secondary" data-action="steps-gist">${data.settings.stepsGist ? 'Synchro automatique activée · modifier' : 'Activer la synchro automatique'}</button>
    <p class="help">Une automatisation iPhone envoie tes pas plusieurs fois par jour ; l'app les récupère toute seule à l'ouverture. Mise en route dans le README.</p>
    <div class="section-title">Recherche des calories</div>
    <button class="secondary" data-action="ai-mode">ChatGPT : ${AI_MODES[data.settings.aiMode || 'off']}</button>
    <p class="help">L'app utilise d'abord sa base intégrée. Si un plat est inconnu, elle peut demander à ChatGPT avec ton abonnement (via l'app ChatGPT), puis tu recolles la réponse.</p>
    <div class="section-title">Sauvegarde</div>
    <button class="secondary" data-action="export">Exporter mes données</button>
    <button class="secondary" data-action="import">Importer une sauvegarde</button>
    <p class="help">Tes données restent sur ton iPhone. Exporte de temps en temps pour garder une copie.</p>
    <div class="section-title">Zone sensible</div>
    <button class="danger" data-action="reset">Tout effacer</button>
    <p class="help">Ma Semaine · version 0.5</p>`;
}

// ---------- Feuilles (formulaires) ----------

const catOptions = sel => CATEGORIES.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.name}</option>`).join('');

function openEventSheet(ev, isNew) {
  const routine = routineOf(ev);
  const repeatValue = routine ? routine.repeat : 'none';
  const origDate = ev.date;
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="text-btn" data-close>Annuler</button>
      <h2>${isNew ? 'Nouvelle activité' : 'Modifier'}</h2>
      <button type="submit" class="text-btn">OK</button>
    </div>
    <div class="field">
      <label><input type="text" name="title" placeholder="Titre" value="${esc(ev.title)}" required></label>
    </div>
    <div class="field">
      <label>Jour <input type="date" name="date" value="${ev.date}" required></label>
      <label>Début <input type="time" name="start" value="${ev.start}" required></label>
      <label>Fin <input type="time" name="end" value="${ev.end}" required></label>
    </div>
    <div class="field">
      <label>Catégorie <select name="category">${catOptions(ev.category)}</select></label>
      <label>Répéter <select name="repeat">${Object.entries(REPEATS).map(([k, v]) => `<option value="${k}" ${k === repeatValue ? 'selected' : ''}>${v}</option>`).join('')}${repeatValue === 'custom' ? `<option value="custom" selected>${daysLabel(routine.days)[0].toUpperCase() + daysLabel(routine.days).slice(1)}</option>` : ''}</select></label>
      ${isNew ? '' : `<label>Fait <input type="checkbox" name="done" ${ev.done ? 'checked' : ''}></label>`}
    </div>
    <div class="field">
      <label><textarea name="notes" placeholder="Notes">${esc(ev.notes)}</textarea></label>
    </div>
    ${isNew ? '' : routine
      ? '<div class="row-buttons"><button type="button" class="danger" data-skip>Sauter cette fois</button><button type="button" class="danger" data-stop>Arrêter la routine</button></div>'
      : '<button type="button" class="danger" data-delete>Supprimer</button>'}`;

  sheetForm.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    const start = f.get('start');
    let end = f.get('end');
    if (toMin(end) <= toMin(start)) end = fromMin(Math.min(toMin(start) + 60, 23 * 60 + 59));
    Object.assign(ev, {
      title: f.get('title').trim(), date: f.get('date'), start, end,
      category: f.get('category'), notes: f.get('notes').trim(), done: f.get('done') === 'on',
    });
    if (isNew) data.events.push(ev);
    const repeat = f.get('repeat');
    if (routine && repeat === repeatValue) {
      // Occurrence d'une routine modifiée : seulement cette fois, ou aussi les suivantes ?
      const changed = ['title', 'start', 'end', 'category'].some(k => routine[k] !== ev[k]);
      if (changed && confirm('Appliquer ce changement aux prochaines fois aussi ?\n(Annuler = seulement cette fois)')) applyRepeat(ev, repeat);
      else if (ev.date !== origDate && !routine.skips.includes(origDate)) routine.skips.push(origDate);
    } else {
      applyRepeat(ev, repeat);
    }
    save();
    sheet.close();
    state.tab = 'week';
    state.weekStart = startOfWeek(fromISO(ev.date));
    render();
    if (isNew) toast('Ajouté au planning');
  };
  bindSheetButtons(() => { data.events = data.events.filter(x => x.id !== ev.id); });
  const done = msg => { save(); sheet.close(); render(); toast(msg); };
  const skip = sheetForm.querySelector('[data-skip]');
  if (skip) skip.onclick = () => { skipOccurrence(ev); done('Routine sautée cette fois'); };
  const stop = sheetForm.querySelector('[data-stop]');
  if (stop) stop.onclick = () => { if (confirm('Arrêter cette routine ? Les prochaines occurrences seront retirées.')) { stopRoutine(ev); done('Routine arrêtée'); } };
  sheet.showModal();
}

function openIdeaSheet(idea, isNew) {
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="text-btn" data-close>Annuler</button>
      <h2>${isNew ? 'Nouvelle idée' : 'Modifier l\'idée'}</h2>
      <button type="submit" class="text-btn">OK</button>
    </div>
    <div class="field">
      <label><input type="text" name="title" placeholder="Ex : Escalade, Musée, Brunch…" value="${esc(idea.title)}" required></label>
    </div>
    <div class="field">
      <label>Catégorie <select name="category">${catOptions(idea.category)}</select></label>
      <label>Durée (min) <input type="number" name="duration" min="5" step="5" value="${idea.duration}" required></label>
    </div>
    <div class="field">
      <label><textarea name="notes" placeholder="Notes (lieu, matériel, avec qui…)">${esc(idea.notes)}</textarea></label>
    </div>
    ${isNew ? '' : '<button type="button" class="danger" data-delete>Supprimer l\'idée</button>'}`;

  sheetForm.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    Object.assign(idea, {
      title: f.get('title').trim(), category: f.get('category'),
      duration: Math.max(5, parseInt(f.get('duration'), 10) || 60), notes: f.get('notes').trim(),
    });
    if (isNew) data.ideas.push(idea);
    save();
    sheet.close();
    render();
  };
  bindSheetButtons(() => {
    data.ideas = data.ideas.filter(x => x.id !== idea.id);
    if (state.suggestion === idea.id) state.suggestion = null;
  });
  sheet.showModal();
}

function bindSheetButtons(onDelete) {
  sheetForm.querySelector('[data-close]').onclick = () => sheet.close();
  const del = sheetForm.querySelector('[data-delete]');
  if (del) del.onclick = () => {
    if (!confirm('Supprimer ?')) return;
    onDelete();
    save();
    sheet.close();
    render();
  };
}

// Fermer la feuille en touchant le fond
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

function newEvent(date, preset = {}) {
  const duration = preset.duration || 60;
  const start = preset.start || '18:00';
  return {
    id: uid(), title: preset.title || '', date, start,
    end: fromMin(Math.min(toMin(start) + duration, 23 * 60 + 59)),
    category: preset.category || 'autre', notes: preset.notes || '', done: false,
  };
}

function defaultPlanDate() {
  // Aujourd'hui si on regarde la semaine en cours, sinon le lundi de la semaine affichée
  const today = new Date();
  const end = addDays(state.weekStart, 6);
  return today >= state.weekStart && today <= addDays(end, 1) ? toISO(today) : toISO(state.weekStart);
}

// ---------- Sauvegarde ----------

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const file = new File([blob], `ma-semaine-${toISO(new Date())}.json`, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'Sauvegarde Ma Semaine' }).catch(() => {});
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    try {
      const parsed = JSON.parse(await input.files[0].text());
      if (!Array.isArray(parsed.events) || !Array.isArray(parsed.ideas)) throw new Error();
      if (!confirm('Remplacer toutes tes données actuelles par cette sauvegarde ?')) return;
      data = withDefaults(parsed);
      save();
      toast('Sauvegarde importée');
      render();
    } catch {
      toast('Fichier invalide');
    }
  };
  input.click();
}

// ---------- Onglet Forme : calories, pas, poids ----------

const MEALS = [
  { id: 'petit-dej', name: 'Petit-déjeuner' },
  { id: 'dejeuner', name: 'Déjeuner' },
  { id: 'collation', name: 'Collation' },
  { id: 'diner', name: 'Dîner' },
];
const SHORTCUT_NAME = 'Pas Ma Semaine';
const fmtNum = n => Math.round(n).toLocaleString('fr-FR');

function currentMeal() {
  const h = new Date().getHours();
  return h < 11 ? 'petit-dej' : h < 15 ? 'dejeuner' : h < 18 ? 'collation' : 'diner';
}

function latestWeight() {
  const w = [...data.weights].sort((a, b) => a.date.localeCompare(b.date)).pop();
  return w ? w.kg : null;
}

function profileComplete() {
  const p = data.profile;
  return p.sex && p.age > 0 && p.height > 0;
}

// Calories dépensées en marchant : environ 0,5 kcal par pas et par 1 000 kg (≈ 0,035 kcal/pas à 70 kg)
const stepsKcal = steps => steps * (latestWeight() || 70) * 0.0005;

// --- Maintien calorique adaptatif ---
// Principe : si on mange en moyenne A kcal/jour et que le poids varie de P kg/jour,
// alors le maintien vaut A − P × 7 700 (≈ kcal contenues dans 1 kg de masse corporelle).
// Recalculé à chaque nouvelle pesée hebdomadaire, sur les 4 dernières semaines.
const KCAL_PER_KG = 7700;
const MAINT_WINDOW_DAYS = 28;
const MIN_LOGGED_DAYS = 5;

function intakeByDay() {
  const m = {};
  data.food.forEach(f => { m[f.date] = (m[f.date] || 0) + (f.kcal || 0); });
  return m;
}

// Jours strictement après `from` jusqu'à `to` inclus ; seuls les jours où des repas sont notés comptent
function periodStats(from, to, intake) {
  let days = 0, logged = 0, sum = 0, stepsSum = 0, stepsDays = 0;
  for (let d = addDays(fromISO(from), 1); toISO(d) <= to; d = addDays(d, 1)) {
    const iso = toISO(d);
    days++;
    if (intake[iso] > 0) { logged++; sum += intake[iso]; }
    if (data.steps[iso] > 0) { stepsDays++; stepsSum += data.steps[iso]; }
  }
  return { days, logged, avg: logged ? sum / logged : null, avgSteps: stepsDays ? stepsSum / stepsDays : null };
}

const sortedWeights = () => [...data.weights].sort((a, b) => a.date.localeCompare(b.date));

function computeMaintenance() {
  const ws = sortedWeights();
  if (ws.length < 2) return { ready: false, weighIns: ws.length, logged: 0 };
  const last = ws[ws.length - 1];
  const limit = toISO(addDays(fromISO(last.date), -MAINT_WINDOW_DAYS));
  let pts = ws.filter(w => w.date >= limit);
  if (pts.length < 2) pts = ws.slice(-2);
  const stats = periodStats(pts[0].date, last.date, intakeByDay());
  if (stats.logged < MIN_LOGGED_DAYS) return { ready: false, weighIns: ws.length, logged: stats.logged };

  // Tendance du poids (régression linéaire) : moins sensible à une pesée isolée
  const xs = pts.map(w => (fromISO(w.date) - fromISO(pts[0].date)) / 864e5);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = pts.reduce((a, w) => a + w.kg, 0) / pts.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (pts[i].kg - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);

  const kcal = Math.round(stats.avg - slope * KCAL_PER_KG);
  return {
    ready: true, kcal, avgIntake: stats.avg, kgPerWeek: slope * 7, logged: stats.logged, days: stats.days,
    weeks: Math.round(stats.days / 7), avgSteps: stats.avgSteps,
    reliable: stats.logged >= 14 && pts.length >= 3 && stats.logged / stats.days >= 0.6,
    plausible: kcal >= 1200 && kcal <= 5000,
  };
}

// Détail semaine par semaine (entre deux pesées consécutives)
function weeklyMaintenance() {
  const ws = sortedWeights();
  const intake = intakeByDay();
  const rows = [];
  for (let i = 1; i < ws.length; i++) {
    const st = periodStats(ws[i - 1].date, ws[i].date, intake);
    const delta = ws[i].kg - ws[i - 1].kg;
    rows.push({
      date: ws[i].date, delta, avg: st.avg, logged: st.logged, days: st.days,
      kcal: st.logged >= 3 ? Math.round(st.avg - (delta * KCAL_PER_KG) / st.days) : null,
    });
  }
  return rows.reverse();
}

function formulaMaintenance() {
  if (!profileComplete()) return null;
  const p = data.profile;
  const bmr = 10 * (latestWeight() || 70) + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5);
  return bmr * 1.2;
}

// Objectif du jour : maintien calculé sur tes données si possible, sinon formule théorique
// (métabolisme de base Mifflin-St Jeor × 1,2 + pas), puis ajustement selon l'objectif.
function dailyTarget(steps) {
  const goal = { perdre: -400, maintenir: 0, prendre: 300 }[data.profile.goal || 'maintenir'];
  const m = computeMaintenance();
  if (m.ready && m.plausible) {
    // Le maintien inclut déjà tes pas habituels : on n'ajoute que les pas en plus de ta moyenne
    const extra = m.avgSteps !== null ? Math.max(0, stepsKcal(steps - m.avgSteps)) : 0;
    return { source: 'adaptatif', base: m.kcal, steps: extra, goal, total: m.kcal + extra + goal };
  }
  const base = formulaMaintenance();
  if (base === null) return null;
  return { source: 'formule', base, steps: stepsKcal(steps), goal, total: base + stepsKcal(steps) + goal };
}

function renderMaintenance() {
  const m = computeMaintenance();
  const f = formulaMaintenance();
  const sign = x => (x > 0 ? '+' : x < 0 ? '−' : '±');
  const kg = x => `${sign(x)}${Math.abs(x).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg`;
  let html = '<div class="section-title">Maintien calorique · mis à jour chaque semaine</div><div class="card">';
  if (m.ready) {
    html += `
      <div class="chart-head">
        <span class="stat">${fmtNum(m.kcal)} kcal/jour</span>
        <span class="badge ${m.reliable && m.plausible ? 'ok' : ''}">${m.reliable && m.plausible ? 'fiable' : 'provisoire'}</span>
      </div>
      <p class="help" style="margin:4px 0 0">Sur ${m.weeks <= 1 ? 'la dernière semaine' : `les ${m.weeks} dernières semaines`}, tu as mangé en moyenne
        <b>${fmtNum(m.avgIntake)} kcal/jour</b> (${m.logged} jours notés sur ${m.days}) et ton poids a évolué de <b>${kg(m.kgPerWeek)} par semaine</b>.</p>
      ${m.plausible ? '' : '<p class="help" style="margin:6px 0 0;color:var(--danger)">Résultat peu crédible : vérifie que tous tes repas sont bien notés. L\'objectif utilise la formule théorique en attendant.</p>'}
      ${!m.reliable && m.plausible ? '<p class="help" style="margin:6px 0 0">Il devient fiable après 3 pesées et 2 semaines de repas notés.</p>' : ''}`;
  } else {
    const steps = [
      `${Math.min(m.weighIns, 2)}/2 pesées`,
      `${Math.min(m.logged, MIN_LOGGED_DAYS)}/${MIN_LOGGED_DAYS} jours de repas notés entre deux pesées`,
    ];
    html += `<div class="idea-title">Calcul en préparation</div>
      <p class="help" style="margin:4px 0 0">Il faut au moins : ${steps.join(' et ')}. Note tes repas chaque jour et pèse-toi le dimanche.</p>`;
  }
  if (f !== null) html += `<p class="help" style="margin:8px 0 0">Estimation théorique (profil) : ${fmtNum(f)} kcal/jour + tes pas.</p>`;
  html += '</div>';

  const rows = weeklyMaintenance().slice(0, 6);
  if (rows.length) {
    html += `<div class="list">${rows.map(r => `
      <div class="idea">
        <span class="idea-main">
          <div class="idea-title">Semaine au ${fmtShort(fromISO(r.date))}</div>
          <div class="idea-meta">${r.avg === null ? 'repas non notés' : `mangé ${fmtNum(r.avg)} kcal/j (${r.logged}/${r.days} j)`} · ${kg(r.delta)}</div>
        </span>
        <span class="kcal">${r.kcal === null ? '–' : `≈ ${fmtNum(r.kcal)}`}</span>
      </div>`).join('')}</div>
      <p class="help" style="margin:6px 4px 14px">Le chiffre de chaque semaine varie beaucoup (eau, sel…) ; le maintien en haut lisse sur 4 semaines.</p>`;
  }
  return html;
}

function isoWeekKey(iso) {
  return toISO(startOfWeek(fromISO(iso)));
}

function renderHealth() {
  const iso = state.healthDate;
  const todayISO = toISO(new Date());
  const isToday = iso === todayISO;
  const food = data.food.filter(f => f.date === iso);
  const eaten = food.reduce((s, f) => s + (f.kcal || 0), 0);
  const steps = data.steps[iso] || 0;
  const target = dailyTarget(steps);
  const weighedThisWeek = data.weights.some(w => isoWeekKey(w.date) === isoWeekKey(todayISO));

  let html = `
    <div class="header">
      <h1>Forme</h1>
      <div class="week-nav">
        ${isToday ? '' : '<button class="text-btn" data-action="health-today">Aujourd\'hui</button>'}
        <button class="icon-btn" data-action="health-prev" aria-label="Jour précédent">‹</button>
        <button class="icon-btn" data-action="health-next" aria-label="Jour suivant">›</button>
      </div>
    </div>
    <p class="subtitle" style="text-transform:capitalize">${isToday ? 'Aujourd\'hui · ' : ''}${fmtDay(fromISO(iso))}</p>`;

  if (new Date().getDay() === 0 && !weighedThisWeek) {
    html += `
      <div class="suggestion">
        <div class="label">C'est dimanche</div>
        <div class="idea-title">Pense à te peser ⚖️</div>
        <button class="primary" style="margin:0" data-action="add-weight">Noter mon poids</button>
      </div>`;
  }

  // Bilan
  const pct = target ? Math.min(100, (eaten / target.total) * 100) : 0;
  const left = target ? Math.round(target.total - eaten) : null;
  html += `
    <div class="card stats">
      <div><div class="stat">${fmtNum(eaten)}</div><div class="stat-label">kcal mangées</div></div>
      <div><div class="stat">${fmtNum(steps)}</div><div class="stat-label">pas · ${fmtNum(stepsKcal(steps))} kcal</div></div>
      <div><div class="stat ${left !== null && left < 0 ? 'over' : ''}">${left === null ? '–' : fmtNum(Math.abs(left))}</div>
        <div class="stat-label">${left === null ? 'objectif' : left >= 0 ? 'kcal restantes' : 'kcal en trop'}</div></div>
    </div>`;
  if (target) {
    html += `<div class="meter"><div class="meter-fill ${left < 0 ? 'over' : ''}" style="width:${pct}%"></div></div>
      <p class="help" style="margin:-4px 4px 14px">Objectif ${fmtNum(target.total)} kcal = ${target.source === 'adaptatif' ? `maintien ${fmtNum(target.base)} (tes données)${target.steps >= 1 ? ` + pas en plus ${fmtNum(target.steps)}` : ''}` : `repos ${fmtNum(target.base)} + pas ${fmtNum(target.steps)}`}${target.goal ? ` ${target.goal < 0 ? '−' : '+'} ${Math.abs(target.goal)} (${data.profile.goal})` : ''}</p>`;
  } else {
    html += `<p class="help" style="margin:-4px 4px 14px"><button class="text-btn" data-action="profile" style="padding:0">Renseigne ton profil</button> pour avoir un objectif calorique.</p>`;
  }

  // Saisie des repas
  html += `
    <div class="section-title">Qu'as-tu mangé ?</div>
    <div class="field food-input">
      <label><textarea id="food-text" placeholder="Ex : pâtes carbonara, 2 croissants et un coca"></textarea></label>
      <label>Repas <select id="food-meal">${MEALS.map(m => `<option value="${m.id}" ${m.id === currentMeal() ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>
    </div>
    <div id="usual-foods"></div>
    <div class="row-buttons">
      <button class="primary" data-action="add-food" id="add-food-btn">Calculer et ajouter</button>
      ${(data.settings.aiMode || 'off') !== 'off' ? '<button class="secondary" data-action="ask-ai">Demander à ChatGPT</button>' : ''}
    </div>`;

  const pending = data.settings.pendingAI;
  if (pending) {
    html += `
      <div class="suggestion">
        <div class="label">En attente de ChatGPT</div>
        <div class="idea-meta" style="margin:4px 0 10px">« ${esc(pending.text)} »</div>
        <button class="primary" data-action="paste-ai">📋 Coller la réponse de ChatGPT</button>
        <div class="row-buttons">
          <button class="secondary" style="margin:0" data-action="local-ai">Base intégrée</button>
          <button class="secondary" style="margin:0" data-action="cancel-ai">Annuler</button>
        </div>
      </div>`;
  }

  MEALS.forEach(m => {
    const items = food.filter(f => f.meal === m.id);
    if (!items.length) return;
    const sub = items.reduce((s, f) => s + (f.kcal || 0), 0);
    html += `<div class="section-title row-title"><span>${m.name}</span><span>${fmtNum(sub)} kcal</span></div>
      <div class="list">${items.map(f => `
        <button class="idea food-item" data-action="edit-food" data-id="${f.id}">
          <span class="idea-main">
            <div class="idea-title">${esc(f.name)}</div>
            <div class="idea-meta">${esc(f.detail || '')}</div>
          </span>
          <span class="kcal ${f.kcal === null ? 'missing' : ''}">${f.kcal === null ? '?' : fmtNum(f.kcal)}</span>
        </button>`).join('')}</div>`;
  });

  // Pas
  html += `
    <div class="section-title">Pas (app Santé)</div>
    ${state.stepsPending && !data.settings.stepsGist ? '<button class="primary" data-action="paste-steps">📋 Coller les pas importés</button>' : ''}
    ${renderGistStatus()}
    <div class="row-buttons">
      <button class="secondary" data-action="sync-steps">Synchroniser avec Santé</button>
      <button class="secondary" data-action="edit-steps">Saisir</button>
    </div>`;

  // Poids
  html += `<div class="section-title">Poids · pesée hebdomadaire</div>${renderWeightChart()}
    <button class="secondary" data-action="add-weight">Ajouter une pesée</button>${renderMaintenance()}`;

  view.innerHTML = html;
  const mealSel = document.getElementById('food-meal');
  renderUsualFoods(mealSel.value);
  mealSel.onchange = () => renderUsualFoods(mealSel.value);
}

// Raccourcis « repas habituels » : un toucher pour ajouter ce que tu manges souvent
function renderUsualFoods(meal) {
  const box = document.getElementById('usual-foods');
  if (!box) return;
  const iso = state.healthDate;
  const usual = usualFoods(meal, iso);
  const last = lastMeal(meal, iso);
  const alreadyLogged = data.food.some(f => f.date === iso && f.meal === meal);
  if (!usual.length && !last.length) { box.innerHTML = ''; return; }
  const lastKcal = last.reduce((s, f) => s + (f.kcal || 0), 0);
  box.innerHTML = `
    ${last.length && !alreadyLogged ? `<button class="secondary" data-action="repeat-meal" data-meal="${meal}">↺ Comme d'habitude : ${esc(last.map(f => f.name).join(', '))} · ${fmtNum(lastKcal)} kcal</button>` : ''}
    ${usual.length ? `<div class="chips">${usual.map(f => `<button class="chip selectable" data-action="usual-add" data-id="${f.id}">+ ${esc(f.name)} · ${fmtNum(f.kcal)}</button>`).join('')}</div>` : ''}`;
}

function renderWeightChart() {
  const pts = [...data.weights].sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  if (!pts.length) return '<p class="help" style="margin-bottom:10px">Aucune pesée pour l\'instant.</p>';

  const W = 340, H = 150, padL = 34, padR = 14, padT = 14, padB = 24;
  const kgs = pts.map(p => p.kg);
  const min = Math.floor(Math.min(...kgs) - 1), max = Math.ceil(Math.max(...kgs) + 1);
  const x = i => pts.length === 1 ? (padL + W - padR) / 2 : padL + (i * (W - padL - padR)) / (pts.length - 1);
  const y = kg => padT + ((max - kg) * (H - padT - padB)) / (max - min);
  const ticks = [min, (min + max) / 2, max];
  const tip = pts.find(p => p.date === state.weightTip) || pts[pts.length - 1];
  const prev = pts[pts.indexOf(tip) - 1];
  const delta = prev ? tip.kg - prev.kg : null;

  return `
    <div class="card chart">
      <div class="chart-head">
        <span class="stat">${tip.kg.toLocaleString('fr-FR')} kg</span>
        <span class="stat-label">${fmtShort(fromISO(tip.date))}${delta !== null ? ` · ${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg vs semaine précédente` : ''}</span>
      </div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution du poids">
        ${ticks.map(t => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
          <text x="${padL - 6}" y="${y(t) + 4}" class="axis" text-anchor="end">${+t.toFixed(1)}</text>`).join('')}
        ${pts.length > 1 ? `<polyline class="line" points="${pts.map((p, i) => `${x(i)},${y(p.kg)}`).join(' ')}"/>` : ''}
        ${pts.map((p, i) => `
          <circle class="dot-pt ${p === tip ? 'active' : ''}" cx="${x(i)}" cy="${y(p.kg)}" r="${p === tip ? 5.5 : 4}"/>
          <circle class="hit" cx="${x(i)}" cy="${y(p.kg)}" r="16" data-action="weight-tip" data-date="${p.date}"/>`).join('')}
        <text x="${x(0)}" y="${H - 6}" class="axis" text-anchor="${pts.length === 1 ? 'middle' : 'start'}">${fmtShort(fromISO(pts[0].date))}</text>
        ${pts.length > 1 ? `<text x="${x(pts.length - 1)}" y="${H - 6}" class="axis" text-anchor="end">${fmtShort(fromISO(pts[pts.length - 1].date))}</text>` : ''}
      </svg>
    </div>`;
}

// --- Repas ---

const AI_MODES = { off: 'désactivé', shortcut: 'via le raccourci', web: 'via le site' };

// Base intégrée d'abord ; si un plat est inconnu (ou sur demande), on passe la main à ChatGPT
function addFood(forceAI = false) {
  const textEl = document.getElementById('food-text');
  const text = textEl.value.trim();
  if (!text) { textEl.focus(); return; }
  const meal = document.getElementById('food-meal').value;
  const items = estimateLocal(text, data.customFoods);
  const unknown = items.filter(i => i.kcal === null).length;
  if ((forceAI || unknown) && (data.settings.aiMode || 'off') !== 'off') {
    askChatGPT(text, meal);
    return;
  }
  addItems(items, meal, state.healthDate);
}

function addItems(items, meal, date) {
  items.forEach(i => data.food.push({ id: uid(), date, meal, ...i }));
  save();
  render();
  const total = items.reduce((s, i) => s + (i.kcal || 0), 0);
  const unknown = items.filter(i => i.kcal === null).length;
  toast(unknown ? `${unknown} aliment${unknown > 1 ? 's' : ''} à compléter` : `+${fmtNum(total)} kcal`);
}

function askChatGPT(text, meal) {
  data.settings.pendingAI = { text, meal, date: state.healthDate };
  save();
  render();
  const prompt = chatgptPrompt(text);
  if (data.settings.aiMode === 'shortcut') {
    location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(CHATGPT_SHORTCUT)}&input=text&text=${encodeURIComponent(prompt)}`;
  } else {
    window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`, '_blank');
  }
}

async function pasteChatGPT() {
  const pending = data.settings.pendingAI;
  if (!pending) return;
  let text = null;
  try { text = await navigator.clipboard.readText(); } catch { /* permission refusée */ }
  let items = text ? parseChatGPT(text) : [];
  if (!items.length) {
    text = prompt('Colle ici la réponse de ChatGPT :');
    if (!text) return;
    items = parseChatGPT(text);
  }
  if (!items.length) { toast('Réponse non reconnue : copie bien toute la réponse'); return; }
  delete data.settings.pendingAI;
  addItems(items, pending.meal, pending.date);
}

function cancelChatGPT(useLocal) {
  const pending = data.settings.pendingAI;
  delete data.settings.pendingAI;
  if (useLocal && pending) addItems(estimateLocal(pending.text, data.customFoods), pending.meal, pending.date);
  else { save(); render(); }
}

function openAiSheet() {
  const mode = data.settings.aiMode || 'off';
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="text-btn" data-close>Annuler</button>
      <h2>ChatGPT</h2>
      <button type="submit" class="text-btn">OK</button>
    </div>
    <div class="field">
      <label>Utiliser ChatGPT <select name="mode">${Object.entries(AI_MODES).map(([k, v]) => `<option value="${k}" ${k === mode ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></label>
    </div>
    <p class="help"><b>Via le raccourci</b> (conseillé) : le raccourci « ${CHATGPT_SHORTCUT} » interroge l'app ChatGPT et copie la réponse ; à créer une fois (voir le README).<br>
    <b>Via le site</b> : ouvre ChatGPT avec la question déjà écrite ; copie la réponse puis reviens.<br>
    Dans les deux cas, c'est ton abonnement qui est utilisé, sans frais en plus.</p>`;
  sheetForm.onsubmit = e => {
    e.preventDefault();
    data.settings.aiMode = new FormData(sheetForm).get('mode');
    save();
    sheet.close();
    render();
  };
  bindSheetButtons(() => {});
  sheet.showModal();
}

function openFoodSheet(item) {
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="text-btn" data-close>Annuler</button>
      <h2>Modifier</h2>
      <button type="submit" class="text-btn">OK</button>
    </div>
    <div class="field">
      <label><input type="text" name="name" value="${esc(item.name)}" required></label>
      <label>Calories <input type="number" name="kcal" min="0" inputmode="numeric" value="${item.kcal ?? ''}" placeholder="kcal" required></label>
      <label>Repas <select name="meal">${MEALS.map(m => `<option value="${m.id}" ${m.id === item.meal ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>
      <label>Retenir pour la prochaine fois <input type="checkbox" name="remember" ${item.source === 'inconnu' ? 'checked' : ''}></label>
    </div>
    <p class="help" style="margin:-4px 4px 12px">${esc(item.detail || '')}</p>
    <button type="button" class="danger" data-delete>Supprimer</button>`;
  sheetForm.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    const kcal = Math.max(0, parseInt(f.get('kcal'), 10) || 0);
    if (f.get('remember') === 'on') data.customFoods[f.get('name').trim().toLowerCase()] = kcal;
    Object.assign(item, {
      name: f.get('name').trim(), kcal, meal: f.get('meal'),
      detail: item.kcal !== kcal ? 'Valeur saisie' : item.detail,
      source: item.kcal !== kcal ? 'perso' : item.source,
    });
    save();
    sheet.close();
    render();
  };
  bindSheetButtons(() => { data.food = data.food.filter(x => x.id !== item.id); });
  sheet.showModal();
}

// --- Pas : passerelle avec l'app Santé via un raccourci iOS ---

function syncSteps() {
  state.stepsPending = true;
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
  setTimeout(render, 800);
}

// --- Synchro automatique : une automatisation iOS dépose les pas dans un gist secret GitHub,
// que l'app relit à chaque ouverture (lecture sans clé : seul l'identifiant du gist est stocké ici).

const GIST_FILE = 'pas.txt';
const GIST_MIN_INTERVAL = 2 * 60 * 1000;

const gistIdFrom = input => (String(input).match(/[0-9a-f]{20,}/i) || [null])[0];

function renderGistStatus() {
  const s = data.settings;
  if (!s.stepsGist) {
    return '<p class="help" style="margin:0 4px 8px"><button class="text-btn" data-action="steps-gist" style="padding:0">Activer la synchro automatique</button> pour ne plus rien avoir à faire.</p>';
  }
  if (state.gistError) return `<p class="help" style="margin:0 4px 8px;color:var(--danger)">Synchro auto en échec : ${esc(state.gistError)}</p>`;
  if (!s.stepsSyncedAt) return '<p class="help" style="margin:0 4px 8px">🔄 Synchro auto activée · en attente du premier envoi du raccourci</p>';
  return `<p class="help" style="margin:0 4px 8px">🔄 Synchro auto · données envoyées ${fmtAgo(s.stepsSyncedAt)}</p>`;
}

function fmtAgo(isoDate) {
  const d = new Date(isoDate);
  const min = Math.round((Date.now() - d) / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min} min`;
  const sameDay = toISO(d) === toISO(new Date());
  return `${sameDay ? 'aujourd\'hui' : fmtShort(d)} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchStepsFromGist(force = false) {
  const id = data.settings.stepsGist;
  if (!id || !navigator.onLine) return;
  if (!force && state.lastGistFetch && Date.now() - state.lastGistFetch < GIST_MIN_INTERVAL) return;
  state.lastGistFetch = Date.now();
  try {
    const res = await fetch(`https://api.github.com/gists/${id}`, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(res.status === 404 ? 'gist introuvable (vérifie le lien)' : `erreur ${res.status}`);
    const gist = await res.json();
    const file = gist.files[GIST_FILE] || Object.values(gist.files)[0];
    if (!file) throw new Error('gist vide');
    const text = file.truncated ? await (await fetch(file.raw_url, { cache: 'no-store' })).text() : file.content;
    const totals = parseSteps(text, toISO(new Date(gist.updated_at)));
    let changed = gist.updated_at !== data.settings.stepsSyncedAt || !!state.gistError;
    Object.entries(totals).forEach(([d, n]) => { if (data.steps[d] !== n) { data.steps[d] = n; changed = true; } });
    data.settings.stepsSyncedAt = gist.updated_at;
    state.gistError = null;
    state.stepsPending = false;
    if (changed) {
      save();
      if (state.tab === 'health' && !sheet.open) render();
    }
  } catch (e) {
    state.gistError = e.message;
    if (state.tab === 'health' && !sheet.open) render();
  }
}

function editStepsGist() {
  const current = data.settings.stepsGist ? `https://gist.github.com/${data.settings.stepsGist}` : '';
  const v = prompt('Lien de ton gist secret (voir le README, « Synchro automatique des pas »). Laisse vide pour désactiver :', current);
  if (v === null) return;
  const id = gistIdFrom(v);
  if (v.trim() && !id) { toast('Lien de gist non reconnu'); return; }
  data.settings.stepsGist = id || undefined;
  delete data.settings.stepsSyncedAt;
  state.gistError = null;
  save();
  render();
  if (id) { toast('Synchro automatique activée'); fetchStepsFromGist(true); }
  else toast('Synchro automatique désactivée');
}

// Accepte « 2026-10-12: 8432 » (une ligne par jour, ou des échantillons bruts qu'on additionne),
// les dates JJ/MM/AAAA, ou un simple nombre (attribué à `fallbackDate`, par défaut le jour affiché).
function parseSteps(text, fallbackDate = state.healthDate) {
  const toInt = s => parseInt(s.replace(/[\s\u202f\u00a0]/g, '').replace(/[.,]\d{1,2}$/, '').replace(/[.,]/g, ''), 10);
  const totals = {};
  const re = /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})[^\d]+?(\d[\d \u202f\u00a0.,]*)/g;
  let m;
  while ((m = re.exec(text))) {
    let d = m[1];
    if (d.includes('/')) { const [dd, mm, yy] = d.split('/'); d = `${yy}-${mm}-${dd}`; }
    const n = toInt(m[2]);
    if (!isNaN(n)) totals[d] = (totals[d] || 0) + n;
  }
  if (!Object.keys(totals).length) {
    const n = toInt((text.match(/\d[\d \u202f\u00a0.,]*/) || [''])[0]);
    if (!isNaN(n)) totals[fallbackDate] = n;
  }
  return totals;
}

function applySteps(totals) {
  const days = Object.keys(totals);
  if (!days.length) { toast('Aucun nombre de pas trouvé'); return; }
  days.forEach(d => { data.steps[d] = totals[d]; });
  state.stepsPending = false;
  save();
  render();
  toast(days.length > 1 ? `Pas importés pour ${days.length} jours` : `${fmtNum(totals[days[0]])} pas enregistrés`);
}

async function pasteSteps() {
  let text = null;
  try { text = await navigator.clipboard.readText(); } catch { /* permission refusée */ }
  if (!text) text = prompt('Colle ici le texte copié par le raccourci :');
  if (text) applySteps(parseSteps(text));
}

function editSteps() {
  const v = prompt(`Nombre de pas le ${fmtShort(fromISO(state.healthDate))} :`, data.steps[state.healthDate] || '');
  if (v === null) return;
  const n = parseInt(v.replace(/\D/g, ''), 10);
  if (isNaN(n)) delete data.steps[state.healthDate];
  else data.steps[state.healthDate] = n;
  save();
  render();
}

// --- Poids ---

function openWeightSheet() {
  const todayISO = toISO(new Date());
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="text-btn" data-close>Annuler</button>
      <h2>Pesée</h2>
      <button type="submit" class="text-btn">OK</button>
    </div>
    <div class="field">
      <label>Poids (kg) <input type="number" name="kg" step="0.1" min="20" max="300" inputmode="decimal" value="${latestWeight() ?? ''}" required autofocus></label>
      <label>Date <input type="date" name="date" value="${todayISO}" required></label>
    </div>
    <p class="help">Une pesée par semaine : une nouvelle pesée la même semaine remplace l'ancienne.</p>`;
  sheetForm.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    const date = f.get('date');
    const kg = Math.round(parseFloat(String(f.get('kg')).replace(',', '.')) * 10) / 10;
    data.weights = data.weights.filter(w => isoWeekKey(w.date) !== isoWeekKey(date));
    data.weights.push({ date, kg });
    state.weightTip = date;
    save();
    sheet.close();
    render();
    const m = computeMaintenance();
    toast(m.ready && m.plausible ? `Pesée enregistrée · maintien ≈ ${fmtNum(m.kcal)} kcal/j` : 'Pesée enregistrée');
  };
  bindSheetButtons(() => {});
  sheet.showModal();
}

// --- Profil & réglages ---

function openProfileSheet() {
  const p = data.profile;
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="text-btn" data-close>Annuler</button>
      <h2>Mon profil</h2>
      <button type="submit" class="text-btn">OK</button>
    </div>
    <div class="field">
      <label>Sexe <select name="sex"><option value="h" ${p.sex === 'h' ? 'selected' : ''}>Homme</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Femme</option></select></label>
      <label>Âge <input type="number" name="age" min="10" max="110" inputmode="numeric" value="${p.age || ''}" required></label>
      <label>Taille (cm) <input type="number" name="height" min="100" max="250" inputmode="numeric" value="${p.height || ''}" required></label>
      <label>Objectif <select name="goal">
        <option value="perdre" ${p.goal === 'perdre' ? 'selected' : ''}>Perdre du poids</option>
        <option value="maintenir" ${!p.goal || p.goal === 'maintenir' ? 'selected' : ''}>Maintenir</option>
        <option value="prendre" ${p.goal === 'prendre' ? 'selected' : ''}>Prendre du poids</option>
      </select></label>
    </div>
    <p class="help">Le poids utilisé est celui de ta dernière pesée.</p>`;
  sheetForm.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    data.profile = { sex: f.get('sex'), age: +f.get('age'), height: +f.get('height'), goal: f.get('goal') };
    save();
    sheet.close();
    render();
  };
  bindSheetButtons(() => {});
  sheet.showModal();
}

// --- Notifications (rappel de pesée du dimanche) ---

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Clés VAPID générées sur le téléphone : la clé privée ne quitte l'iPhone que dans le code
// que l'utilisateur colle lui-même dans les secrets GitHub.
async function vapidKeys() {
  if (data.settings.vapid) return data.settings.vapid;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = b64url(await crypto.subtle.exportKey('raw', pair.publicKey));
  const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
  data.settings.vapid = { publicKey, privateKey };
  save();
  return data.settings.vapid;
}

async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Les notifications ne sont disponibles que lorsque l\'app est installée sur l\'écran d\'accueil (Safari → Partager → Sur l\'écran d\'accueil), puis ouverte depuis son icône.');
    return;
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifications refusées'); return; }
    const keys = await vapidKeys();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && b64url(sub.options.applicationServerKey) !== keys.publicKey) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keys.publicKey });
    data.settings.pushSub = JSON.stringify({ subscription: sub.toJSON(), vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey });
    save();
    showPushCode(data.settings.pushSub);
  } catch (e) {
    alert(`Impossible d'activer les notifications : ${e.message}`);
  }
}

function showPushCode(code) {
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <span></span><h2>Code de notification</h2>
      <button type="button" class="text-btn" data-close>OK</button>
    </div>
    <p class="help" style="margin:0 4px 10px">Dernière étape (une seule fois) : copie ce code et colle-le dans le secret GitHub <b>PUSH_CONFIG</b> du dépôt (voir le README). Ce code est personnel : ne le partage pas.</p>
    <div class="field"><label><textarea readonly style="min-height:120px;font-size:12px">${esc(code)}</textarea></label></div>
    <button type="button" class="primary" id="copy-push">Copier le code</button>`;
  sheetForm.onsubmit = e => e.preventDefault();
  sheetForm.querySelector('[data-close]').onclick = () => sheet.close();
  sheetForm.querySelector('#copy-push').onclick = () =>
    navigator.clipboard.writeText(code).then(() => toast('Code copié'), () => toast('Sélectionne le texte et copie-le'));
  sheet.showModal();
}

// ---------- Événements ----------

document.querySelector('.tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  state.tab = b.dataset.tab;
  render();
  window.scrollTo(0, 0);
  if (state.tab === 'health') fetchStepsFromGist();
});

view.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const { action, id, date } = b.dataset;
  switch (action) {
    case 'prev': state.weekStart = addDays(state.weekStart, -7); render(); break;
    case 'next': state.weekStart = addDays(state.weekStart, 7); render(); break;
    case 'today': state.weekStart = startOfWeek(new Date()); render(); break;
    case 'add': openEventSheet(newEvent(date), true); break;
    case 'edit': openEventSheet(data.events.find(x => x.id === id), false); break;
    case 'filter': state.ideaFilter = b.dataset.cat; state.suggestion = null; render(); break;
    case 'suggest': suggest(); break;
    case 'new-idea': openIdeaSheet({ id: uid(), title: '', category: state.ideaFilter === 'all' ? 'loisirs' : state.ideaFilter, duration: 60, notes: '' }, true); break;
    case 'edit-idea': openIdeaSheet(data.ideas.find(x => x.id === id), false); break;
    case 'plan': {
      const idea = data.ideas.find(x => x.id === id);
      openEventSheet(newEvent(defaultPlanDate(), idea), true);
      break;
    }
    case 'health-prev': state.healthDate = toISO(addDays(fromISO(state.healthDate), -1)); render(); break;
    case 'health-next': state.healthDate = toISO(addDays(fromISO(state.healthDate), 1)); render(); break;
    case 'health-today': state.healthDate = toISO(new Date()); render(); break;
    case 'add-food': addFood(); break;
    case 'edit-food': openFoodSheet(data.food.find(x => x.id === id)); break;
    case 'sync-steps': syncSteps(); break;
    case 'paste-steps': pasteSteps(); break;
    case 'edit-steps': editSteps(); break;
    case 'repeat-meal': {
      const meal = b.dataset.meal;
      addItems(lastMeal(meal, state.healthDate).map(({ name, kcal, detail, source }) => ({ name, kcal, detail, source })), meal, state.healthDate);
      break;
    }
    case 'usual-add': {
      const f = data.food.find(x => x.id === id);
      if (f) addItems([{ name: f.name, kcal: f.kcal, detail: f.detail, source: f.source }], document.getElementById('food-meal').value, state.healthDate);
      break;
    }
    case 'routine-yes': {
      const s = detectRoutines().find(x => x.key === b.dataset.key);
      if (s) { routineFromSuggestion(s); save(); render(); toast(`Routine créée : ${s.title} ${daysLabel(s.days)}`); }
      break;
    }
    case 'routine-no': learn().dismissed[b.dataset.key] = true; save(); render(); break;
    case 'propose-week':
      state.proposals = proposeWeek(state.weekStart);
      render();
      if (!state.proposals.length) toast('Pas de créneau libre ou d\'idée à proposer cette semaine');
      break;
    case 'props-all': {
      const ws = toISO(state.weekStart), we = toISO(addDays(state.weekStart, 6));
      state.proposals.filter(p => p.date >= ws && p.date <= we).forEach(acceptProposal);
      save(); render(); toast('Ajouté au planning');
      break;
    }
    case 'props-clear': state.proposals = []; render(); break;
    case 'prop-ok': { const p = state.proposals.find(x => x.id === id); if (p) { acceptProposal(p); save(); render(); } break; }
    case 'prop-no': {
      const p = state.proposals.find(x => x.id === id);
      if (p) { rejectIdea(p.title); state.proposals = state.proposals.filter(x => x !== p); save(); render(); }
      break;
    }
    case 'mark-done': { const e = data.events.find(x => x.id === id); if (e) { e.done = true; save(); render(); } break; }
    case 'today-yes': {
      const idea = data.ideas.find(i => i.id === id);
      if (idea) { data.events.push(newEvent(toISO(new Date()), { ...idea, start: fromMin(+b.dataset.start) })); save(); render(); toast('Ajouté à ta journée'); }
      break;
    }
    case 'today-no': {
      const idea = data.ideas.find(i => i.id === id);
      if (idea) { rejectIdea(idea.title); state.todayDismissed = true; save(); render(); }
      break;
    }
    case 'steps-gist': editStepsGist(); break;
    case 'add-weight': openWeightSheet(); break;
    case 'weight-tip': state.weightTip = b.dataset.date; render(); break;
    case 'profile': openProfileSheet(); break;
    case 'ai-mode': openAiSheet(); break;
    case 'ask-ai': addFood(true); break;
    case 'paste-ai': pasteChatGPT(); break;
    case 'local-ai': cancelChatGPT(true); break;
    case 'cancel-ai': cancelChatGPT(false); break;
    case 'enable-push': enablePush(); break;
    case 'export': exportData(); break;
    case 'import': importData(); break;
    case 'reset':
      if (confirm('Effacer toutes les activités et idées ? Cette action est définitive.')) {
        localStorage.removeItem(STORAGE_KEY);
        data = load();
        render();
      }
      break;
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Retour dans l'app (après le raccourci Santé par exemple)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (state.tab === 'health' && !sheet.open) render();
  // Retour après « Synchroniser » : le raccourci vient d'envoyer les pas, on relit tout de suite
  fetchStepsFromGist(state.stepsPending);
});

// Ouverture depuis la notification du dimanche
if (new URLSearchParams(location.search).has('pesee')) {
  state.tab = 'health';
  history.replaceState(null, '', location.pathname);
  render();
  openWeightSheet();
} else {
  render();
}
fetchStepsFromGist(true);
