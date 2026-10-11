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

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* données illisibles : on repart de zéro */ }
  return { events: [], ideas: DEFAULT_IDEAS.map(i => ({ id: uid(), notes: '', ...i })) };
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

  const totalEntries = Object.entries(totals);
  if (totalEntries.length) {
    html += `<div class="chips">${totalEntries.map(([c, m]) =>
      `<span class="chip"><span class="dot" style="background:${cat(c).color}"></span>${cat(c).name} · ${fmtDuration(m)}</span>`).join('')}</div>`;
  }

  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const iso = toISO(d);
    const evs = eventsOn(iso);
    html += `
      <section class="day ${iso === todayISO ? 'today' : ''}">
        <div class="day-head">
          <span class="day-title">${fmtDay(d)}</span>
          <button class="day-add" data-action="add" data-date="${iso}" aria-label="Ajouter">+</button>
        </div>
        ${evs.length ? `<div class="day-list">${evs.map(e => `
          <button class="event ${e.done ? 'done' : ''}" data-action="edit" data-id="${e.id}">
            <span class="bar" style="background:${cat(e.category).color}"></span>
            <span class="time">${e.start}<br>${e.end}</span>
            <span><div class="title">${esc(e.title)}</div>${e.notes ? `<div class="note">${esc(e.notes)}</div>` : ''}</span>
          </button>`).join('')}</div>` : '<div class="empty">Rien de prévu</div>'}
      </section>`;
  }
  view.innerHTML = html;
}

// ---------- Onglet Activités ----------

function plannedThisWeek(title) {
  const s = toISO(state.weekStart), e = toISO(addDays(state.weekStart, 6));
  return data.events.some(ev => ev.title === title && ev.date >= s && ev.date <= e);
}

function suggest() {
  const pool = data.ideas.filter(i => (state.ideaFilter === 'all' || i.category === state.ideaFilter));
  const fresh = pool.filter(i => !plannedThisWeek(i.title) && i.id !== state.suggestion);
  const pick = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
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
  view.innerHTML = `
    <div class="header"><h1>Réglages</h1></div>
    <div class="section-title">Sauvegarde</div>
    <button class="secondary" data-action="export">Exporter mes données</button>
    <button class="secondary" data-action="import">Importer une sauvegarde</button>
    <p class="help">Tes données restent sur ton iPhone. Exporte de temps en temps pour garder une copie.</p>
    <div class="section-title">Zone sensible</div>
    <button class="danger" data-action="reset">Tout effacer</button>
    <p class="help">Ma Semaine · version 0.1</p>`;
}

// ---------- Feuilles (formulaires) ----------

const catOptions = sel => CATEGORIES.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.name}</option>`).join('');

function openEventSheet(ev, isNew) {
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
      ${isNew ? '' : `<label>Fait <input type="checkbox" name="done" ${ev.done ? 'checked' : ''}></label>`}
    </div>
    <div class="field">
      <label><textarea name="notes" placeholder="Notes">${esc(ev.notes)}</textarea></label>
    </div>
    ${isNew ? '' : '<button type="button" class="danger" data-delete>Supprimer</button>'}`;

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
    save();
    sheet.close();
    state.tab = 'week';
    state.weekStart = startOfWeek(fromISO(ev.date));
    render();
    if (isNew) toast('Ajouté au planning');
  };
  bindSheetButtons(() => { data.events = data.events.filter(x => x.id !== ev.id); });
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
      data = parsed;
      save();
      toast('Sauvegarde importée');
      render();
    } catch {
      toast('Fichier invalide');
    }
  };
  input.click();
}

// ---------- Événements ----------

document.querySelector('.tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  state.tab = b.dataset.tab;
  render();
  window.scrollTo(0, 0);
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

render();
