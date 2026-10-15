'use strict';

// ---------- Données ----------

const CATEGORIES = [
  { id: 'travail', name: 'Travail', color: '#5b8def', icon: '💼' },
  { id: 'sport', name: 'Sport', color: '#34c759', icon: '🏃' },
  { id: 'social', name: 'Social', color: '#ff9f0a', icon: '👥' },
  { id: 'loisirs', name: 'Loisirs', color: '#af52de', icon: '🎮' },
  { id: 'maison', name: 'Maison', color: '#a2845e', icon: '🏠' },
  { id: 'sante', name: 'Santé', color: '#ff375f', icon: '🧘' },
  { id: 'etudes', name: 'Études', color: '#30b0c7', icon: '🎓' },
  { id: 'autre', name: 'Autre', color: '#8e8e93', icon: '✨' },
];
const cat = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
// Pastille d'icône teintée de la couleur de la catégorie
const catIcon = (id, size = '') => { const c = cat(id); return `<span class="cat-ico ${size}" style="--c:${c.color}">${c.icon}</span>`; };

const STORAGE_KEY = 'ma-semaine-v1';

const DEFAULT_IDEAS = [
  { title: 'Course à pied', category: 'sport', duration: 45 },
  { title: 'Séance de sport', category: 'sport', duration: 60 },
  { title: 'Dîner entre amis', category: 'social', duration: 120, at: '20:00' },
  { title: 'Appeler la famille', category: 'social', duration: 30 },
  { title: 'Cinéma', category: 'loisirs', duration: 150, at: '20:30' },
  { title: 'Lecture', category: 'loisirs', duration: 45 },
  { title: 'Courses de la semaine', category: 'maison', duration: 60 },
  { title: 'Ménage', category: 'maison', duration: 60 },
  { title: 'Méditation', category: 'sante', duration: 15 },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const EMPTY_HEALTH = () => ({ food: [], steps: {}, weights: [], profile: {}, customFoods: {}, settings: {}, routines: [], learn: { dismissed: {}, rejected: {} }, tasks: [], projects: [], books: [], media: [] });
const withDefaults = d => ({ ...EMPTY_HEALTH(), meta: {}, ...d });

function load() {
  try {
    const raw = localStorage.getItem(storageKeyFor(getSession()));
    if (raw) return withDefaults(JSON.parse(raw));
  } catch (e) { /* données illisibles : on repart de zéro */ }
  return withDefaults({ events: [], ideas: DEFAULT_IDEAS.map(i => ({ id: uid(), notes: '', ...i })) });
}

let data = load();
// ---------- Place disponible sur l'appareil ----------
// Le navigateur limite le stockage local (environ 5 Mo). Quand on s'en approche, les données les plus
// anciennes sont supprimées petit à petit (mois par mois), en gardant toujours les derniers mois,
// les poids, les routines, les projets, les livres et les devoirs.
const STORAGE_SOFT_LIMIT = 2000000; // caractères (≈ 4 Mo en mémoire) : marge sous la limite du navigateur
const STORAGE_TARGET = 1600000;
const KEEP_DAYS_STEPS = [180, 120, 60, 30];

function pruneOldData(target) {
  const size = () => JSON.stringify(data).length;
  if (size() <= target) return 0;
  let removed = 0;
  // 1. Le cache de l'IA (recalculable) en premier, des plus anciennes entrées aux plus récentes
  const cache = data.learn && data.learn.aiCache;
  if (cache) {
    const keys = Object.keys(cache);
    while (keys.length && size() > target) { delete cache[keys.shift()]; removed++; }
  }
  // 2. Puis le mois le plus ancien des repas, activités et pas, sans toucher aux derniers mois
  for (const keepDays of KEEP_DAYS_STEPS) {
    const minDate = toISO(addDays(new Date(), -keepDays));
    while (size() > target) {
      const oldest = [...data.food.map(f => f.date), ...data.events.map(e => e.date), ...Object.keys(data.steps)]
        .filter(d => d && d < minDate).sort()[0];
      if (!oldest) break;
      const month = oldest.slice(0, 7);
      const old = d => d && d.startsWith(month) && d < minDate;
      const before = data.food.length + data.events.length;
      data.food = data.food.filter(f => !old(f.date));
      data.events = data.events.filter(e => !old(e.date));
      Object.keys(data.steps).forEach(d => { if (old(d)) delete data.steps[d]; });
      removed += before - data.food.length - data.events.length;
    }
    if (size() <= target) break;
  }
  return removed;
}

// Enregistre sur l'appareil, puis (avec un compte) envoie au serveur quelques instants plus tard
function save() {
  data.meta = { ...(data.meta || {}), updatedAt: Date.now() };
  const key = storageKeyFor(getSession());
  let json = JSON.stringify(data);
  if (json.length > STORAGE_SOFT_LIMIT && pruneOldData(STORAGE_TARGET)) {
    json = JSON.stringify(data);
    toast('Place libérée : les données les plus anciennes ont été supprimées');
  }
  try {
    localStorage.setItem(key, json);
  } catch (e) {
    // Limite atteinte plus tôt que prévu (selon l'appareil) : on libère davantage et on réessaie
    pruneOldData(Math.floor(json.length * 0.7));
    try {
      localStorage.setItem(key, JSON.stringify(data));
      toast('Place libérée : les données les plus anciennes ont été supprimées');
    } catch {
      toast('Stockage plein : exporte tes données dans Réglages');
    }
  }
  cloudSchedulePush();
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
// Fin d'une activité en minutes : une fin avant le début veut dire « le lendemain » (soirée jusqu'à 2 h…)
const endMin = e => { const s = toMin(e.start), x = toMin(e.end); return x <= s ? x + 1440 : x; };
const durMin = e => endMin(e) - toMin(e.start);
const overnight = e => toMin(e.end) < toMin(e.start);
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
  gridScroll: null,
  tabScroll: {},
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
  view.classList.toggle('wide', state.tab === 'week');
  document.body.dataset.tab = state.tab; // couleurs et icône propres à chaque section
  // Onglets selon les modules choisis au questionnaire
  const mods = prefs().modules;
  const hidden = { goals: !mods.goals, health: !mods.forme };
  if (hidden[state.tab]) state.tab = 'week';
  document.querySelectorAll('.tabbar button').forEach(b => {
    b.hidden = !!hidden[b.dataset.tab];
    b.classList.toggle('active', b.dataset.tab === state.tab);
  });
  // Position de la bulle qui glisse derrière l'onglet actif
  const tabs = [...document.querySelectorAll('.tabbar button:not([hidden])')];
  const bar = document.querySelector('.tabbar');
  bar.style.setProperty('--n', tabs.length);
  bar.style.setProperty('--i', Math.max(0, tabs.findIndex(b => b.dataset.tab === state.tab)));
  if (state.tab === 'week') renderWeek();
  else if (state.tab === 'ideas') renderIdeas();
  else if (state.tab === 'health') renderHealth();
  else if (state.tab === 'goals') renderGoals();
  else if (state.tab === 'media') renderMedia();
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
  weekEvents.forEach(e => { totals[e.category] = (totals[e.category] || 0) + durMin(e); });

  let html = `
    <div class="header">
      <h1>${isCurrent ? (data.settings.name ? `Salut ${esc(data.settings.name)}` : 'Cette semaine') : 'Semaine'}</h1>
      <div class="week-nav">
        ${isCurrent ? '' : '<button class="text-btn" data-action="today">Aujourd\'hui</button>'}
        <button class="icon-btn" data-action="prev" aria-label="Semaine précédente">‹</button>
        <button class="icon-btn" data-action="next" aria-label="Semaine suivante">›</button>
      </div>
    </div>
    <p class="subtitle">Du ${fmtShort(start)} au ${fmtShort(end)} · ${weekEvents.length} activité${weekEvents.length > 1 ? 's' : ''}</p>`;

  // Ouverte dans Safari : prévenir que les données de l'app installée ne sont pas ici
  if (!isStandalone && /iPhone|iPad/.test(navigator.userAgent) && !state.safariDismissed) {
    html += `
      <div class="suggestion warn">
        <div class="label">Tu es dans Safari</div>
        <div class="idea-meta" style="margin:4px 0 10px">Si l'app est déjà sur ton écran d'accueil, ouvre-la depuis son icône : Safari et l'app installée ne partagent pas les mêmes données. Pour l'installer : Partager → Sur l'écran d'accueil.</div>
        <button class="secondary" style="margin:0" data-action="safari-ok">Compris</button>
      </div>`;
  }
  // Semaine type pas encore décrite : on invite à le faire (le planning s'organise autour)
  if (data.settings.onboarded && !prefs().lifeText && !state.lifeDismissed) {
    html += `
      <div class="suggestion">
        <div class="label">Pour mieux t'organiser</div>
        <div class="idea-title" style="margin:4px 0 6px">Décris ta semaine en quelques mots</div>
        <div class="idea-meta" style="margin-bottom:10px">Travail, cours, horaires, sport, habitudes… L'app crée tes activités régulières et planifie autour.</div>
        <div class="row"><button class="secondary" data-action="life-later">Plus tard</button><button class="primary" data-action="life-describe">Décrire ma semaine</button></div>
      </div>`;
  }
  if (isCurrent && prepareDue()) {
    html += `
      <div class="suggestion">
        <div class="label">C'est dimanche</div>
        <div class="idea-title" style="margin:4px 0 6px">Prépare ta semaine prochaine</div>
        <div class="idea-meta" style="margin-bottom:10px">Devoirs à rendre, activités prévues, propositions pour ton temps libre : 2 minutes pour partir serein.</div>
        <button class="primary" data-action="prepare-week">🗓️ Préparer ma semaine</button>
      </div>`;
  }
  if (isCurrent) html += renderToday();

  const detected = isPast ? null : detectRoutines()[0];
  if (detected) {
    html += `
      <div class="suggestion">
        <div class="label">🧠 J'ai remarqué une habitude</div>
        <div class="idea-title" style="margin:4px 0 2px">${esc(detected.title)}</div>
        <div class="idea-meta" style="margin-bottom:10px">${daysLabel(detected.days)} vers ${detected.start} · ${fmtDuration(durMin(detected))}</div>
        <div class="row">
          <button class="secondary" data-action="routine-no" data-key="${esc(detected.key)}">Non merci</button>
          <button class="primary" data-action="routine-yes" data-key="${esc(detected.key)}">En faire une routine</button>
        </div>
      </div>`;
  }

  if (!isPast) {
    html += proposals.length
      ? `<div class="row-buttons"><button class="primary" data-action="props-all">✓ Tout accepter (${proposals.length})</button><button class="secondary" data-action="props-clear">Effacer</button></div>`
      : '<div class="row-buttons week-actions"><button class="secondary" data-action="propose-week">✨ Proposer ma semaine</button><button class="secondary" data-action="tell-weekly">💬 Un changement&nbsp;?</button></div>';
  }

  const totalEntries = Object.entries(totals);
  if (totalEntries.length) {
    html += `<div class="chips">${totalEntries.map(([c, m]) =>
      `<span class="chip cat-chip" style="--c:${cat(c).color}">${cat(c).icon} ${cat(c).name} · ${fmtDuration(m)}</span>`).join('')}</div>`;
  }

  html += renderWeekGrid(start, proposals, todayISO);
  view.innerHTML = html;
  placeGridScroll(isCurrent);
}

// ---------- Grille de la semaine : jours en colonnes, heures en lignes ----------

const DAY_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

// Répartit les activités qui se chevauchent sur plusieurs colonnes (« voies »)
function layoutDay(items) {
  items.sort((a, b) => a.s - b.s || b.e - a.e);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach(it => {
      let l = lanes.findIndex(end => end <= it.s);
      if (l < 0) { l = lanes.length; lanes.push(0); }
      lanes[l] = it.e;
      it.lane = l;
    });
    cluster.forEach(it => { it.lanes = lanes.length; });
    out.push(...cluster);
    cluster = [];
  };
  items.forEach(it => {
    if (cluster.length && it.s >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  });
  if (cluster.length) flush();
  return out;
}

function renderWeekGrid(start, proposals, todayISO) {
  const days = [...Array(7)].map((_, i) => toISO(addDays(start, i)));
  const all = days.flatMap(iso => [...eventsOn(iso), ...proposals.filter(p => p.date === iso)]);
  // Toute la journée (0 h – 24 h) ; la grille défile verticalement et s'ouvre vers le matin
  const h0 = 0;
  const h1 = 24;
  const top = m => ((m - h0 * 60) / 60) * 100; // en « heures × 100 », converti en px par la variable CSS
  const now = nowMinutes();

  const cols = days.map(iso => {
    // Une activité qui finit après minuit s'arrête à 24 h et continue au début du jour suivant
    const span = x => ({ s: toMin(x.start), e: Math.min(1440, Math.max(endMin(x), toMin(x.start) + 20)) });
    const prev = toISO(addDays(fromISO(iso), -1));
    const items = layoutDay([
      ...eventsOn(iso).map(ev => ({ item: ev, ...span(ev) })),
      ...eventsOn(prev).filter(overnight).map(ev => ({ item: { ...ev, cont: true }, s: 0, e: Math.max(20, toMin(ev.end)) })),
      ...proposals.filter(p => p.date === iso).map(p => ({ item: { ...p, proposal: true }, ...span(p) })),
    ]);
    const blocks = items.map(({ item: ev, s, e, lane, lanes }) => {
      const c = cat(ev.category).color;
      const style = `top:calc(var(--hour) * ${top(s) / 100});height:calc(var(--hour) * ${(e - s) / 60} - 2px);left:calc(${(lane / lanes) * 100}% + 1px);width:calc(${100 / lanes}% - 3px);--c:${c}`;
      const short = e - s < 45;
      if (ev.proposal) {
        return `<div class="wg-ev ghost ${short ? 'short' : ''}" style="${style}" data-action="noop">
          <div class="wg-t">✨ ${esc(ev.title)}</div>${short ? '' : `<div class="wg-h">${ev.start}–${ev.end}</div>`}
          <div class="wg-acts"><button class="mini no" data-action="prop-no" data-id="${ev.id}" aria-label="Refuser">✕</button><button class="mini ok" data-action="prop-ok" data-id="${ev.id}" aria-label="Accepter">✓</button></div>
        </div>`;
      }
      return `<button class="wg-ev ${ev.done ? 'done' : ''} ${short ? 'short' : ''}" style="${style}" data-action="edit" data-id="${ev.id}">
        <div class="wg-t"><span class="wg-ico">${cat(ev.category).icon}</span>${esc(ev.title)}${ev.routineId ? ' <span class="routine-icon">↻</span>' : ''}</div>
        ${short ? '' : `<div class="wg-h">${ev.cont ? `suite · jusqu'à ${ev.end}` : `${ev.start}–${ev.end}${overnight(ev) ? ' (+1 j)' : ''}`}</div>`}
      </button>`;
    }).join('');
    const nowLine = iso === todayISO && now >= h0 * 60 && now <= h1 * 60
      ? `<div class="wg-now" style="top:calc(var(--hour) * ${top(now) / 100})"></div>` : '';
    return `<div class="wg-col ${iso === todayISO ? 'today' : ''}" data-action="grid-add" data-date="${iso}" data-h0="${h0}">${blocks}${nowLine}</div>`;
  });

  const heads = days.map((iso, i) => {
    const d = fromISO(iso);
    return `<button class="wg-day ${iso === todayISO ? 'today' : ''}" data-action="add" data-date="${iso}">
      <span>${DAY_SHORT[i]}</span><b>${d.getDate()}</b></button>`;
  }).join('');
  const hours = [...Array(h1 - h0)].map((_, k) => `<div class="wg-hour">${String(h0 + k).padStart(2, '0')}:00</div>`).join('');

  return `
    <div class="wgrid" style="--rows:${h1 - h0}">
      <div class="wg-scroll">
        <div class="wg-inner">
          <div class="wg-head"><div class="wg-gutter"></div>${heads}</div>
          <div class="wg-body"><div class="wg-times">${hours}</div>${cols.join('')}</div>
        </div>
      </div>
    </div>
    <p class="help" style="margin:6px 4px 0">Touche un créneau vide pour ajouter une activité à cette heure.</p>`;
}

// Garde la position de défilement horizontal ; sur la semaine en cours, démarre sur aujourd'hui
function placeGridScroll(isCurrent) {
  const sc = view.querySelector('.wg-scroll');
  if (!sc) return;
  const key = toISO(state.weekStart);
  // Hauteur : on reprend là où on était, sinon on ouvre sur l'heure actuelle (cette semaine) ou sur 7 h
  const hourPx = sc.querySelector('.wg-hour').getBoundingClientRect().height;
  const startMin = isCurrent ? Math.max(0, nowMinutes() - 90) : 7 * 60;
  sc.scrollTop = state.gridScroll && state.gridScroll.key === key && state.gridScroll.top != null ? state.gridScroll.top : Math.round(startMin / 60 * hourPx);
  if (state.gridScroll && state.gridScroll.key === key) sc.scrollLeft = state.gridScroll.left;
  else if (isCurrent) {
    // Aujourd'hui en première colonne visible (après le rappel des heures)
    const idx = [...sc.querySelectorAll('.wg-col')].findIndex(c => c.classList.contains('today'));
    const colW = sc.querySelector('.wg-col').getBoundingClientRect().width;
    if (idx > 0) requestAnimationFrame(() => { sc.scrollLeft = Math.round(idx * colW); });
  }
  sc.addEventListener('scroll', () => { state.gridScroll = { key, left: sc.scrollLeft, top: sc.scrollTop }; }, { passive: true });
}

// Carte « Aujourd'hui » : en cours / à suivre, activités passées à cocher, créneau libre à remplir
function renderToday() {
  const iso = toISO(new Date());
  const now = nowMinutes();
  const evs = eventsOn(iso);
  const current = evs.find(e => toMin(e.start) <= now && endMin(e) > now);
  const next = evs.find(e => toMin(e.start) > now);
  const toCheck = evs.filter(e => endMin(e) <= now && !e.done);
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
  const ev = { id: uid(), title: p.title, date: p.date, start: p.start, end: p.end, category: p.category, notes: p.notes || (idea ? idea.notes || '' : ''), done: false };
  if (p.taskId) ev.taskId = p.taskId;
  if (p.projectId) ev.projectId = p.projectId;
  data.events.push(ev);
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
      ${CATEGORIES.map(c => `<button class="chip selectable ${state.ideaFilter === c.id ? 'active' : ''}" data-action="filter" data-cat="${c.id}">${c.icon} ${c.name}</button>`).join('')}
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

  const ideaRow = i => `
    <div class="idea">
      ${catIcon(i.category)}
      <button class="idea-main" data-action="edit-idea" data-id="${i.id}">
        <div class="idea-title">${esc(i.title)}</div>
        <div class="idea-meta">${cat(i.category).name} · ${fmtDuration(i.duration)}${plannedThisWeek(i.title) ? ' · ✓ cette semaine' : ''}</div>
      </button>
      <button class="plan-btn" data-action="plan" data-id="${i.id}">Planifier</button>
    </div>`;
  const groups = state.ideaFilter === 'all'
    ? CATEGORIES.map(c => [c, ideas.filter(i => cat(i.category).id === c.id)]).filter(([, l]) => l.length)
    : [[null, ideas]];
  html += ideas.length ? groups.map(([c, list]) => `
    ${c ? `<div class="section-title cat-title" style="--c:${c.color}">${c.icon} ${c.name}</div>` : ''}
    <div class="list">${list.map(ideaRow).join('')}</div>`).join('')
    : '<p class="help">Aucune idée dans cette catégorie. Appuie sur + pour en ajouter.</p>';

  view.innerHTML = html;
}

// ---------- Onglet Réglages ----------

function renderAccount() {
  if (!cloudEnabled()) return '';
  const s = getSession();
  if (!s) {
    return `<div class="section-title">Compte</div>
      <button class="primary" data-action="login">Se connecter / créer un compte</button>
      <p class="help">Avec un compte, tes données sont sauvegardées en ligne et retrouvées sur tous tes appareils (iPhone, ordinateur…).</p>`;
  }
  const pending = data.meta && data.meta.updatedAt !== data.meta.syncedAt;
  const status = cloudState.error ? `⚠️ ${esc(cloudState.error)}`
    : pending ? '⏳ Modifications en cours d\'envoi…'
    : `✓ Synchronisé${cloudState.lastSync ? ` ${fmtAgo(new Date(cloudState.lastSync).toISOString())}` : ''}`;
  return `<div class="section-title">Compte</div>
    <div class="card"><div class="idea-title">${esc(s.user.email)}</div><div class="idea-meta">${status}</div></div>
    <div class="row-buttons"><button class="secondary" data-action="sync-now">Synchroniser</button><button class="secondary" data-action="logout">Se déconnecter</button></div>`;
}

function renderSettings() {
  const p = data.profile;
  view.innerHTML = `
    <div class="header"><h1>Réglages</h1></div>
    ${renderAccount()}
    <div class="section-title">Mes préférences</div>
    <button class="secondary" data-action="tell-weekly">💬 Dis-le à Weekly : un changement en une phrase</button>
    <p class="help" style="margin:-4px 4px 12px">« J'ai arrêté le foot », « je travaille le samedi maintenant », « dentiste jeudi 14h »… l'IA met l'app à jour pour toi.</p>
    <button class="secondary" data-action="life-describe">Redécrire toute ma semaine type</button>
    <button class="secondary" data-action="onboarding">Refaire le questionnaire (goûts, horaires, modules)</button>
    <p class="help">Sports, centres d'intérêt, horaires, objectifs et modules affichés. Tes données sont conservées.</p>
    <div class="section-title">Profil (pour l'objectif calorique)</div>
    <button class="secondary" data-action="profile">${profileComplete() ? `${p.sex === 'f' ? 'Femme' : 'Homme'} · ${ageOf(p)} ans · ${p.height} cm` : 'Renseigner mon profil'}</button>
    <div class="section-title">Rappel du dimanche</div>
    <button class="secondary" data-action="enable-push">${data.settings.pushSub ? 'Voir mon code de notification' : 'Activer les notifications'}</button>
    <p class="help">Chaque dimanche matin, une notification te rappelle de te peser. La mise en route (une seule fois) est expliquée dans le README.</p>
    <div class="section-title">Pas (app Santé)</div>
    <button class="secondary" data-action="steps-gist">${data.settings.stepsGist ? 'Synchro automatique activée · modifier' : 'Activer la synchro automatique'}</button>
    <p class="help">Une automatisation iPhone envoie tes pas plusieurs fois par jour ; l'app les récupère toute seule à l'ouverture. Mise en route dans le README.</p>
    <div class="section-title">Agenda (Google ou iPhone)</div>
    <button class="secondary" data-action="agenda-help">${data.settings.agendaSyncedAt ? `📅 Agenda importé ${fmtAgo(data.settings.agendaSyncedAt)}` : 'Importer mon agenda'}</button>
    <p class="help">Tes rendez-vous apparaissent dans ta semaine et l'app planifie autour.</p>
    <div class="section-title">Recherche des calories</div>
    <button class="secondary" data-action="ai-mode">Recherche IA : ${AI_MODES[aiMode()]}</button>
    ${data.settings.geminiKey ? '' : geminiKeyButton()}
    <p class="help">Avec Gemini, chaque repas tapé est analysé automatiquement par l'IA (gratuit, clé à créer une fois : ${geminiKeyLink('la créer ici')}, puis colle-la dans « Recherche IA »). Sans IA, l'app utilise sa base intégrée de plats courants.</p>
    <div class="section-title">Sauvegarde</div>
    <button class="secondary" data-action="check-updates">Vérifier les mises à jour</button>
    <p class="help">L'app se met à jour toute seule quand tu l'ouvres. Ne la supprime pas de l'écran d'accueil : cela effacerait tes données.</p>
    <button class="secondary" data-action="export">Exporter mes données</button>
    <button class="secondary" data-action="import">Importer une sauvegarde</button>
    <p class="help">Tes données restent sur ton iPhone. Exporte de temps en temps pour garder une copie.</p>
    <div class="section-title">Zone sensible</div>
    <button class="danger" data-action="reset">Tout effacer</button>
    ${cloudEnabled() && getSession() ? '<button class="danger" data-action="delete-cloud" style="margin-top:10px">Supprimer mes données du serveur</button>' : ''}
    <p class="help">Weekly · version 1.3</p>`;
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
      <label>Fin <span class="end-wrap"><small class="next-day" ${overnight(ev) ? '' : 'hidden'}>le lendemain</small><input type="time" name="end" value="${ev.end}" required></span></label>
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

  const nd = sheetForm.querySelector('.next-day');
  const markNextDay = () => { nd.hidden = !(sheetForm.end.value && sheetForm.start.value && toMin(sheetForm.end.value) < toMin(sheetForm.start.value)); };
  sheetForm.start.addEventListener('input', markNextDay);
  sheetForm.end.addEventListener('input', markNextDay);
  sheetForm.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    const start = f.get('start');
    let end = f.get('end');
    if (toMin(end) === toMin(start)) end = fromMin((toMin(start) + 60) % 1440); // fin avant le début = le lendemain
    const wasDone = ev.done;
    if (ev.extId && f.get('category') !== ev.category) ev.categoryEdited = true; // garder ce choix aux prochains imports
    Object.assign(ev, {
      title: f.get('title').trim(), date: f.get('date'), start, end,
      category: f.get('category'), notes: f.get('notes').trim(), done: f.get('done') === 'on',
    });
    if (ev.done && !wasDone) onEventDone(ev);
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
  // La clé IA n'est pas exportée : la sauvegarde peut être partagée ou stockée ailleurs
  // La clé IA n'est incluse que si tu le veux (utile pour tout restaurer après une réinstallation)
  const withKey = data.settings.geminiKey && confirm('Inclure ta clé Gemini dans la sauvegarde ?\n(OK seulement si tu gardes ce fichier pour toi)');
  const copy = { ...data, settings: { ...data.settings, geminiKey: withKey ? data.settings.geminiKey : undefined } };
  const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
  const file = new File([blob], `weekly-${toISO(new Date())}.json`, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'Sauvegarde Weekly' }).catch(() => {});
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
const SHORTCUT_NAME = 'Pas Weekly';
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
  return p.sex && ageOf(p) > 0 && p.height > 0;
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
  const bmr = 10 * (latestWeight() || 70) + 6.25 * p.height - 5 * ageOf(p) + (p.sex === 'f' ? -161 : 5);
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
      ${isChatGPTMode() ? '<button class="secondary" data-action="ask-ai">Demander à ChatGPT</button>' : ''}
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

const AI_MODES = {
  gemini: 'Gemini (automatique, gratuit)',
  shortcut: 'ChatGPT via le raccourci',
  web: 'ChatGPT via le site',
  off: 'désactivée',
};
const aiMode = () => data.settings.aiMode || 'off';
const isChatGPTMode = () => ['shortcut', 'web'].includes(aiMode());

// Recherche IA automatique (Gemini) : un repas déjà analysé est repris du cache, sans nouvel appel
async function estimateWithAI(text) {
  const key = norm(text);
  const cache = (learn().aiCache ||= {});
  if (cache[key]) return cache[key].map(i => ({ ...i }));
  if (!data.settings.geminiModel) {
    data.settings.geminiModel = await pickGeminiModel(data.settings.geminiKey);
  }
  let items;
  try {
    items = await estimateGemini(text, data.settings.geminiKey, data.settings.geminiModel);
  } catch (e) {
    // Modèle retiré entre-temps : on en choisit un autre et on réessaie une fois
    if (!/introuvable|not found|not supported/i.test(e.message)) throw e;
    data.settings.geminiModel = await pickGeminiModel(data.settings.geminiKey);
    items = await estimateGemini(text, data.settings.geminiKey, data.settings.geminiModel);
  }
  const keys = Object.keys(cache);
  if (keys.length > 300) delete cache[keys[0]];
  cache[key] = items;
  return items;
}

// Gemini : tout le repas est analysé automatiquement par l'IA (base intégrée si hors connexion ou en cas d'erreur).
// ChatGPT : base intégrée d'abord ; si un plat est inconnu (ou sur demande), on passe la main à ChatGPT.
async function addFood(forceAI = false) {
  const textEl = document.getElementById('food-text');
  const text = textEl.value.trim();
  if (!text) { textEl.focus(); return; }
  const meal = document.getElementById('food-meal').value;
  const date = state.healthDate;
  let aiError = null;
  if (aiMode() === 'gemini' && data.settings.geminiKey) {
    if (!navigator.onLine) aiError = 'hors connexion';
    else {
      const btn = document.getElementById('add-food-btn');
      btn.disabled = true;
      btn.textContent = 'Recherche IA…';
      try {
        addItems(await estimateWithAI(text), meal, date);
        return;
      } catch (e) {
        aiError = e.message;
      }
    }
  }
  const items = estimateLocal(text, data.customFoods);
  const unknown = items.filter(i => i.kcal === null).length;
  if ((forceAI || unknown) && isChatGPTMode()) {
    askChatGPT(text, meal);
    return;
  }
  addItems(items, meal, date);
  if (aiError) toast(`IA indisponible (${aiError}) : base intégrée utilisée`);
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
  const mode = aiMode();
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="text-btn" data-close>Annuler</button>
      <h2>Recherche IA</h2>
      <button type="submit" class="text-btn">OK</button>
    </div>
    <div class="field">
      <label>Utiliser <select name="mode">${Object.entries(AI_MODES).map(([k, v]) => `<option value="${k}" ${k === mode ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Clé Gemini <input type="password" name="key" value="${esc(data.settings.geminiKey || '')}" placeholder="AIza…" autocomplete="off"></label>
    </div>
    ${geminiKeyButton()}
    <div class="card help-steps">
      <p><b>Gemini (conseillé)</b> : tu tapes ton repas, l'IA calcule tout de suite, rien à copier. Gratuit dans la limite de l'offre de Google, largement suffisante pour tes repas.</p>
      <p>Clé à créer une fois : ${geminiKeyLink('Ouvre la page des clés Gemini')} avec ton compte Google → <b>Create API key</b> → copie-la ici. Elle est gardée sur ton téléphone et sur ton compte si tu es connecté (visible de toi seul), mais pas dans les sauvegardes exportées.</p>
      <p>Avec l'offre gratuite, Google peut utiliser les textes envoyés (ici, tes repas) pour améliorer ses services.</p>
      <p><b>ChatGPT</b> : passe par ton abonnement via l'app ChatGPT, mais il faut revenir et coller la réponse.</p>
    </div>`;
  sheetForm.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    const newMode = f.get('mode');
    const key = String(f.get('key') || '').trim();
    if (newMode === 'gemini') {
      if (!key) { toast('Colle d\'abord ta clé Gemini'); return; }
      const ok = sheetForm.querySelector('[type=submit]');
      ok.textContent = '…';
      try {
        data.settings.geminiModel = await pickGeminiModel(key); // vérifie la clé
      } catch (err) {
        ok.textContent = 'OK';
        toast(`Clé Gemini : ${err.message}`);
        return;
      }
      toast('Recherche IA activée');
    }
    if (key !== data.settings.geminiKey) learn().aiCache = {};
    data.settings.geminiKey = key || undefined;
    data.settings.aiMode = newMode;
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
const CAL_FILE = 'cours.ics';
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
    let imported = false;
    const read = async f => (f.truncated ? (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content);
    // Calendrier Moodle déposé par la GitHub Action « Import calendrier »
    const cal = gist.files[CAL_FILE];
    if (cal) {
      const ics = await read(cal);
      const sig = `${ics.length}:${ics.slice(-200)}`;
      if (sig !== data.settings.calSig) {
        importCalendar(ics);
        data.settings.calSig = sig;
        imported = true;
      }
      data.settings.calSyncedAt = gist.updated_at;
      save();
      if (imported && ['week', 'goals'].includes(state.tab) && !sheet.open) render();
    }
    // Agenda personnel (Google / iPhone) déposé par la même GitHub Action
    const agenda = gist.files[AGENDA_FILE];
    if (agenda) {
      const ics = await read(agenda);
      const sig = `${ics.length}:${ics.slice(-200)}:${toISO(new Date())}`; // réimport au moins une fois par jour (fenêtre glissante)
      if (sig !== data.settings.agendaSig) {
        importAgenda(ics);
        data.settings.agendaSig = sig;
        imported = true;
      }
      data.settings.agendaSyncedAt = gist.updated_at;
      save();
      if (imported && ['week', 'goals'].includes(state.tab) && !sheet.open) render();
    }
    const file = gist.files[GIST_FILE];
    const totals = file ? parseSteps(await read(file), toISO(new Date(gist.updated_at))) : {};
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

// ---------- Préparer la semaine (dimanche 17 h) ----------

const nextWeekStart = () => addDays(startOfWeek(new Date()), 7);
// Le dimanche à partir de 17 h, tant que la semaine suivante n'a pas été préparée
function prepareDue() {
  const now = new Date();
  return now.getDay() === 0 && now.getHours() >= 17 && data.settings.preparedWeek !== toISO(nextWeekStart());
}

function openPrepareSheet() {
  const start = nextWeekStart();
  const ws = toISO(start), we = toISO(addDays(start, 6));
  data.settings.preparedWeek = ws;
  save();
  state.tab = 'week';
  state.weekStart = start;
  state.proposals = [];
  render();
  const events = data.events.filter(e => e.date >= ws && e.date <= we);
  const tasks = (data.tasks || []).filter(t => !t.done && t.due && t.due.slice(0, 10) <= we).sort((a, b) => a.due.localeCompare(b.due));
  const projects = (data.projects || []).filter(p => p.active);
  const busy = events.reduce((m, e) => m + durMin(e), 0);
  sheetForm.innerHTML = `
    <div class="sheet-head"><button type="button" class="text-btn" data-close>Fermer</button><h2>Prépare ta semaine</h2><span></span></div>
    <p class="help" style="margin:0 4px 12px">Du ${fmtShort(start)} au ${fmtShort(addDays(start, 6))}</p>
    <div class="card stats">
      <div><div class="stat">${events.length}</div><div class="stat-label">activités prévues</div></div>
      <div><div class="stat">${fmtDuration(busy) || '0'}</div><div class="stat-label">déjà occupées</div></div>
      <div><div class="stat${tasks.length ? ' over' : ''}">${tasks.length}</div><div class="stat-label">à rendre</div></div>
    </div>
    ${tasks.length ? `<div class="section-title">À rendre</div><div class="list">${tasks.slice(0, 6).map(t => `
      <div class="idea"><div class="idea-main"><div class="idea-title">${esc(t.title)}</div><div class="idea-meta">${t.course ? `${esc(t.course)} · ` : ''}${t.due.slice(0, 10) < ws ? '⚠️ en retard · ' : ''}${fmtShort(new Date(t.due))}</div></div></div>`).join('')}</div>` : ''}
    ${projects.length ? `<p class="help" style="margin:10px 4px 0">🎯 Projets en cours : ${projects.map(p => esc(p.title)).join(', ')}. Leurs séances seront placées dans ton temps libre.</p>` : ''}
    <div style="margin-top:16px">
      <button type="button" class="primary" data-prep="propose">✨ Proposer ma semaine</button>
      <button type="button" class="secondary" data-prep="change">💬 Un changement à signaler ?</button>
    </div>`;
  sheetForm.querySelector('[data-close]').onclick = () => sheet.close();
  sheetForm.querySelector('[data-prep=propose]').onclick = () => {
    sheet.close();
    state.proposals = proposeWeek(state.weekStart);
    render();
    toast(state.proposals.length ? `${state.proposals.length} propositions : ✓ pour garder, ✕ pour refuser` : 'Pas de créneau libre ou d\'idée à proposer');
  };
  sheetForm.querySelector('[data-prep=change]').onclick = () => { sheet.close(); openUpdateSheet(); };
  sheet.showModal();
}

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

// Âge calculé à partir de la date de naissance (les anciens profils n'ont qu'un âge fixe)
function ageOf(p) {
  if (!p || !p.birth) return (p && p.age) || 0;
  const b = fromISO(p.birth), now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a > 0 && a < 120 ? a : 0;
}

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
      <label>Date de naissance <input type="date" name="birth" min="1900-01-01" max="${toISO(new Date())}" value="${p.birth || ''}" required></label>
      <label>Taille (cm) <input type="number" name="height" min="100" max="250" inputmode="numeric" value="${p.height || ''}" required></label>
      <label>Objectif <select name="goal">
        <option value="perdre" ${p.goal === 'perdre' ? 'selected' : ''}>Perdre du poids</option>
        <option value="maintenir" ${!p.goal || p.goal === 'maintenir' ? 'selected' : ''}>Maintenir</option>
        <option value="prendre" ${p.goal === 'prendre' ? 'selected' : ''}>Prendre du poids</option>
      </select></label>
    </div>
    <p class="help">L'âge est calculé tout seul à partir de ta date de naissance. Le poids utilisé est celui de ta dernière pesée.</p>`;
  sheetForm.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    data.profile = { sex: f.get('sex'), birth: f.get('birth'), height: +f.get('height'), goal: f.get('goal') };
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

// Page des secrets GitHub du dépôt qui héberge l'app (https://<compte>.github.io/<dépôt>/)
function secretsUrl() {
  const owner = location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : '';
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return owner && repo ? `https://github.com/${owner}/${repo}/settings/secrets/actions` : '';
}

function showPushCode(code) {
  const url = secretsUrl();
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <span></span><h2>Dernière étape</h2>
      <button type="button" class="text-btn" data-close>OK</button>
    </div>
    <div class="card help-steps">
      <p><b>1.</b> Touche le bouton ci-dessous : le code est copié et la page GitHub s'ouvre.</p>
      <p><b>2.</b> Sur GitHub, touche <b>PUSH_CONFIG</b> (ou <b>New repository secret</b> s'il n'existe pas, avec le nom <b>PUSH_CONFIG</b>).</p>
      <p><b>3.</b> Colle le code dans <b>Secret</b> puis enregistre. C'est tout : les rappels du dimanche (pesée et préparation de la semaine) arriveront ici.</p>
    </div>
    ${url ? `<a class="primary link-btn" id="copy-push" href="${url}" target="_blank" rel="noopener">📋 Copier le code et ouvrir GitHub</a>` : '<button type="button" class="primary" id="copy-push">Copier le code</button>'}
    <details class="push-code"><summary>Voir le code</summary>
      <div class="field"><label><textarea readonly style="min-height:120px;font-size:12px">${esc(code)}</textarea></label></div>
    </details>
    <p class="help" style="margin:8px 4px 0">Ce code est personnel : ne le partage pas.</p>`;
  sheetForm.onsubmit = e => e.preventDefault();
  sheetForm.querySelector('[data-close]').onclick = () => sheet.close();
  // La copie se fait au toucher (avant l'ouverture de GitHub) pour être autorisée par l'iPhone
  sheetForm.querySelector('#copy-push').addEventListener('click', () => {
    navigator.clipboard.writeText(code).then(() => toast('Code copié : colle-le dans PUSH_CONFIG'), () => toast('Copie impossible : ouvre « Voir le code » et copie-le'));
  });
  sheet.showModal();
}

// ---------- Événements ----------

document.querySelector('.tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  const to = b.dataset.tab;
  // Toucher l'onglet déjà ouvert : remonter en haut en douceur, comme sur iOS
  if (to === state.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const order = [...document.querySelectorAll('.tabbar button')].map(x => x.dataset.tab);
  const dir = order.indexOf(to) > order.indexOf(state.tab) ? 1 : -1;
  state.tabScroll[state.tab] = window.scrollY;
  state.tab = to;
  render();
  // Chaque onglet retrouve l'endroit où on l'avait laissé
  window.scrollTo(0, state.tabScroll[to] || 0);
  view.classList.remove('tab-in-l', 'tab-in-r');
  void view.offsetWidth; // relance l'animation
  view.classList.add(dir > 0 ? 'tab-in-r' : 'tab-in-l');
  if (['health', 'goals', 'week'].includes(state.tab)) fetchStepsFromGist();
  if (state.tab === 'media') refreshRunningSeries().then(changed => { if (changed && state.tab === 'media' && !sheet.open) render(); });
});

view.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const { action, id, date } = b.dataset;
  switch (action) {
    case 'grid-add': {
      // Heure touchée, arrondie à la demi-heure
      const hourPx = b.getBoundingClientRect().height / (+getComputedStyle(b.closest('.wgrid')).getPropertyValue('--rows'));
      const m = +b.dataset.h0 * 60 + Math.floor(((e.clientY - b.getBoundingClientRect().top) / hourPx) * 2) * 30;
      openEventSheet(newEvent(date, { start: fromMin(Math.min(m, 23 * 60)) }), true);
      break;
    }
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
    case 'mark-done': { const e = data.events.find(x => x.id === id); if (e) { e.done = true; onEventDone(e); save(); render(); } break; }
    case 'plan-goals':
      state.tab = 'week';
      state.weekStart = startOfWeek(new Date());
      state.proposals = proposeWeek(state.weekStart);
      render();
      window.scrollTo(0, 0);
      toast(state.proposals.length ? `${state.proposals.length} sessions proposées : ✓ pour garder` : 'Rien à planifier cette semaine');
      break;
    case 'new-task': openTaskSheet({ id: uid(), title: '', estimate: 120, done: false, notes: '' }, true); break;
    case 'edit-task': openTaskSheet(data.tasks.find(x => x.id === id), false); break;
    case 'new-project': openProjectPicker(); break;
    case 'edit-project': openProjectSheet(data.projects.find(x => x.id === id), false); break;
    case 'new-book': openBookSheet({ id: uid(), title: '', author: '', pages: 0, page: 0, status: 'todo', rating: 0 }, true); break;
    case 'edit-book': openBookSheet(data.books.find(x => x.id === id), false); break;
    case 'add-rec': {
      const bk = BOOKS.find(x => x.t === b.dataset.title);
      if (bk) { addBook(bk); save(); render(); toast(`« ${bk.t} » ajouté à ta liste`); }
      break;
    }
    case 'books-chatgpt': booksChatGPT(); break;
    case 'moodle-help': openMoodleHelp(); break;
    case 'agenda-help': openAgendaHelp(); break;
    case 'media-add': openMediaSearch(); break;
    case 'media-bulk': openBulkImport(); break;
    case 'media-filter': state.mediaFilter = b.dataset.f; render(); break;
    case 'media-status': state.mediaStatus = b.dataset.s; render(); break;
    case 'open-media': openMediaSheet(media().find(m => m.id === id)); break;
    case 'ep-next': {
      const m = media().find(x => x.id === id);
      const p = m && seriesProgress(m);
      if (p && p.nextEp) { toggleEpisode(m, epKey(p.nextEp), true); save(); render(); toast(`${m.title} S${pad(p.nextEp[0])}E${pad(p.nextEp[1])} vu ✓`); }
      break;
    }
    case 'onboarding': startOnboarding(); break;
    case 'login': showAuth('login'); break;
    case 'logout':
      if (confirm('Se déconnecter ? Tes données restent sur ton compte et seront retirées de cet appareil.')) {
        signOut().then(() => { data = load(); showAuth('login'); });
      }
      break;
    case 'sync-now': cloudPush().then(() => refreshFromCloud()).then(() => { render(); toast(cloudState.error ? `Synchro impossible : ${cloudState.error}` : 'Synchronisé ✓'); }); break;
    case 'delete-cloud':
      if (confirm('Supprimer toutes tes données du serveur ? Elles restent sur cet appareil jusqu\'à la déconnexion.')) {
        deleteCloudData().then(() => { toast('Données supprimées du serveur'); signOut().then(() => { data = load(); showAuth('login'); }); }).catch(err => toast(err.message));
      }
      break;
    case 'check-updates': checkUpdates(); break;
    case 'safari-ok': state.safariDismissed = true; render(); break;
    case 'life-describe': startOnboarding('life'); break;
    case 'tell-weekly': openUpdateSheet(); break;
    case 'prepare-week': openPrepareSheet(); break;
    case 'life-later': state.lifeDismissed = true; render(); break;
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
        localStorage.removeItem(storageKeyFor(getSession()));
        data = load();
        render();
      }
      break;
  }
});

// Mises à jour : l'app se met à jour toute seule à l'ouverture (rien à réinstaller).
// Quand une nouvelle version prend la main, on recharge une fois pour l'afficher.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    if (sheet.open || document.getElementById('onboarding')) { toast('Nouvelle version prête : elle s\'affichera à la prochaine ouverture'); return; }
    sessionStorage.setItem('ma-semaine-updated', '1');
    location.reload();
  });
  if (sessionStorage.getItem('ma-semaine-updated')) {
    sessionStorage.removeItem('ma-semaine-updated');
    setTimeout(() => toast('App mise à jour ✓'), 500);
  }
}

async function checkUpdates() {
  toast('Recherche de mise à jour…');
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
  } catch { /* hors connexion */ }
  setTimeout(() => location.reload(), 800);
}

// Ouverte dans Safari alors que l'app est installée : ce ne sont pas les mêmes données
const isStandalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// Retour dans l'app (après le raccourci Santé par exemple)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (getSession()) refreshFromCloud();
  if (state.tab === 'health' && !sheet.open) render();
  // Retour après « Synchroniser » : le raccourci vient d'envoyer les pas, on relit tout de suite
  fetchStepsFromGist(state.stepsPending);
});

// Ouverture depuis la notification du dimanche
if (new URLSearchParams(location.search).has('preparer')) {
  history.replaceState(null, '', location.pathname);
  openPrepareSheet();
} else if (new URLSearchParams(location.search).has('pesee')) {
  state.tab = 'health';
  history.replaceState(null, '', location.pathname);
  render();
  openWeightSheet();
} else {
  render();
}
view.classList.add('screen-in');
// Démarrage : écran de connexion (si les comptes sont activés et qu'on n'a pas choisi « sans compte »),
// sinon questionnaire au premier lancement ; avec un compte, on récupère la dernière version du serveur.
const authRedirect = cloudEnabled() ? readAuthRedirect() : null;
if (authRedirect?.mode === 'reset') {
  showAuth('reset');
} else if (authRedirect?.error) {
  showAuth('forgot', authRedirect.error);
} else if (cloudEnabled() && !getSession() && !localStorage.getItem(GUEST_KEY)) {
  showAuth();
} else {
  fetchStepsFromGist(true);
  if (!data.settings.onboarded) startOnboarding();
  if (getSession()) refreshFromCloud();
}

async function refreshFromCloud() {
  const changed = await cloudPull();
  if (cloudState.expired) { showAuth('login', 'Ta session a expiré : reconnecte-toi.'); return; }
  if (changed && !sheet.open && !document.getElementById('onboarding')) render();
}
