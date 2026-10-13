'use strict';

// ---------- Objectifs : cours (Moodle), devoirs, projets perso, lecture ----------

const PROJECT_TEMPLATES = {
  aws: {
    title: 'Certification AWS Cloud Practitioner', icon: '☁️', type: 'cert', weeklyMinutes: 150, session: 60, category: 'etudes',
    notes: 'Cours gratuit : « AWS Cloud Practitioner Essentials » sur AWS Skill Builder. Vérifie le code et le programme actuels de l\'examen sur aws.amazon.com/certification. Étape suivante possible : Solutions Architect – Associate.',
    steps: [
      'Le cloud et l\'infrastructure mondiale AWS (régions, zones de disponibilité)',
      'Sécurité : IAM, modèle de responsabilité partagée',
      'Calcul : EC2, Lambda, Auto Scaling',
      'Stockage : S3, EBS, EFS',
      'Réseau : VPC, Route 53, CloudFront',
      'Bases de données : RDS, DynamoDB',
      'Facturation, tarification et support',
      'Well-Architected Framework',
      'Examens blancs (viser 80 % et plus)',
      'Passer l\'examen',
    ],
  },
  code: {
    title: 'Progresser en programmation', icon: '💻', type: 'learning', weeklyMinutes: 180, session: 60, category: 'etudes',
    notes: 'Alterner exercices (algorithmes) et un vrai projet perso : c\'est en construisant qu\'on progresse le plus.',
    steps: [
      'Choisir un langage principal et revoir les bases',
      'Git et GitHub au quotidien',
      'Structures de données et algorithmes (exercices réguliers)',
      'Construire un projet complet de A à Z',
      'Écrire des tests automatisés',
      'Lire du code d\'autres développeurs, contribuer en open source',
      'Publier un projet dans un portfolio',
    ],
  },
  reading: { title: 'Lecture', icon: '📖', type: 'reading', weeklyMinutes: 140, session: 30, category: 'loisirs', notes: '', steps: [] },
  custom: { title: '', icon: '🎯', type: 'custom', weeklyMinutes: 120, session: 60, category: 'autre', notes: '', steps: [] },
};

// Petite bibliothèque pour les recommandations : thèmes, niveau, pages (environ)
const BOOKS = [
  { t: 'Grokking Algorithms', a: 'Aditya Bhargava', p: 250, th: ['prog'], lvl: 'debutant' },
  { t: 'Automate the Boring Stuff with Python', a: 'Al Sweigart', p: 600, th: ['prog'], lvl: 'debutant' },
  { t: 'Eloquent JavaScript', a: 'Marijn Haverbeke', p: 450, th: ['prog'], lvl: 'debutant' },
  { t: 'The Pragmatic Programmer', a: 'David Thomas, Andrew Hunt', p: 350, th: ['prog'], lvl: 'intermediaire' },
  { t: 'Clean Code', a: 'Robert C. Martin', p: 460, th: ['prog'], lvl: 'intermediaire' },
  { t: 'A Philosophy of Software Design', a: 'John Ousterhout', p: 190, th: ['prog'], lvl: 'intermediaire' },
  { t: 'Head First Design Patterns', a: 'Eric Freeman, Elisabeth Robson', p: 670, th: ['prog'], lvl: 'intermediaire' },
  { t: 'Refactoring', a: 'Martin Fowler', p: 450, th: ['prog'], lvl: 'avance' },
  { t: 'Designing Data-Intensive Applications', a: 'Martin Kleppmann', p: 600, th: ['prog', 'cloud'], lvl: 'avance' },
  { t: 'Code Complete', a: 'Steve McConnell', p: 900, th: ['prog'], lvl: 'avance' },
  { t: 'The Mythical Man-Month', a: 'Frederick Brooks', p: 320, th: ['prog'], lvl: 'intermediaire' },
  { t: 'AWS Certified Cloud Practitioner Study Guide', a: 'Ben Piper, David Clinton', p: 300, th: ['cloud', 'aws'], lvl: 'debutant' },
  { t: 'AWS Certified Solutions Architect Study Guide', a: 'Ben Piper, David Clinton', p: 500, th: ['cloud', 'aws'], lvl: 'intermediaire' },
  { t: 'Amazon Web Services in Action', a: 'Andreas Wittig, Michael Wittig', p: 550, th: ['cloud', 'aws'], lvl: 'intermediaire' },
  { t: 'The Phoenix Project', a: 'Gene Kim, Kevin Behr, George Spafford', p: 380, th: ['devops', 'cloud'], lvl: 'debutant' },
  { t: 'Docker Deep Dive', a: 'Nigel Poulton', p: 250, th: ['devops'], lvl: 'debutant' },
  { t: 'Site Reliability Engineering', a: 'Betsy Beyer et al.', p: 550, th: ['devops', 'cloud'], lvl: 'avance' },
  { t: 'Un rien peut tout changer (Atomic Habits)', a: 'James Clear', p: 320, th: ['productivite'], lvl: 'debutant' },
  { t: 'Deep Work', a: 'Cal Newport', p: 300, th: ['productivite'], lvl: 'debutant' },
  { t: 'Ultralearning', a: 'Scott H. Young', p: 300, th: ['productivite', 'prog'], lvl: 'debutant' },
  { t: 'So Good They Can\'t Ignore You', a: 'Cal Newport', p: 290, th: ['productivite'], lvl: 'debutant' },
  { t: 'Mindset', a: 'Carol Dweck', p: 280, th: ['productivite'], lvl: 'debutant' },
  { t: 'Système 1 / Système 2', a: 'Daniel Kahneman', p: 550, th: ['science'], lvl: 'intermediaire' },
  { t: 'Sapiens', a: 'Yuval Noah Harari', p: 500, th: ['science'], lvl: 'debutant' },
  { t: 'Une brève histoire du temps', a: 'Stephen Hawking', p: 230, th: ['science'], lvl: 'debutant' },
  { t: 'Projet Dernière Chance', a: 'Andy Weir', p: 480, th: ['roman', 'sf'], lvl: 'debutant' },
  { t: 'Seul sur Mars', a: 'Andy Weir', p: 400, th: ['roman', 'sf'], lvl: 'debutant' },
  { t: 'Le Problème à trois corps', a: 'Liu Cixin', p: 430, th: ['roman', 'sf'], lvl: 'debutant' },
  { t: 'Fondation', a: 'Isaac Asimov', p: 280, th: ['roman', 'sf'], lvl: 'debutant' },
  { t: 'Dune', a: 'Frank Herbert', p: 800, th: ['roman', 'sf'], lvl: 'debutant' },
  { t: '1984', a: 'George Orwell', p: 370, th: ['roman'], lvl: 'debutant' },
  { t: 'L\'Étranger', a: 'Albert Camus', p: 180, th: ['roman'], lvl: 'debutant' },
  { t: 'L\'Alchimiste', a: 'Paulo Coelho', p: 200, th: ['roman'], lvl: 'debutant' },
];
const TECH_THEMES = ['prog', 'cloud', 'devops', 'aws'];

// ---------- Projets ----------

function newProject(kind) {
  const t = PROJECT_TEMPLATES[kind];
  return {
    id: uid(), title: t.title, icon: t.icon, type: t.type, weeklyMinutes: t.weeklyMinutes, session: t.session,
    category: t.category, notes: t.notes, deadline: '', active: true, created: toISO(new Date()),
    steps: t.steps.map(title => ({ id: uid(), title, done: false })),
  };
}

const readingProject = () => data.projects.find(p => p.type === 'reading' && p.active);
const evMinutes = e => toMin(e.end) - toMin(e.start);

function weekBounds(iso) {
  const ws = toISO(startOfWeek(fromISO(iso)));
  return [ws, toISO(addDays(fromISO(ws), 6))];
}

function projectMinutes(p, iso, withPlanned = false) {
  const [ws, we] = weekBounds(iso);
  return data.events
    .filter(e => e.projectId === p.id && e.date >= ws && e.date <= we && (e.done || withPlanned))
    .reduce((s, e) => s + evMinutes(e), 0);
}

function sessionTitle(p) {
  if (p.type === 'reading') {
    const b = currentBook();
    return `📖 ${b ? b.title : 'Lecture'}`;
  }
  return `${p.icon} ${p.title}`;
}

// Heure habituelle des sessions d'un projet (même jour de la semaine si possible)
function projectUsualStart(p, iso) {
  const past = data.events.filter(e => e.projectId === p.id && e.done);
  if (!past.length) return null;
  const same = past.filter(e => weekdayOf(e.date) === weekdayOf(iso));
  return roundTo(median((same.length ? same : past).map(e => toMin(e.start))));
}

// ---------- Devoirs et tâches ----------

function defaultEstimate(title) {
  if (/exam|partiel|test|quiz|qcm|contr[ôo]le|interro/i.test(title)) return 180; // révisions
  if (/projet|rapport|m[ée]moire|dossier|soutenance/i.test(title)) return 360;
  return 120;
}

const taskSpent = t => data.events.filter(e => e.taskId === t.id && e.done).reduce((s, e) => s + evMinutes(e), 0);
const taskPlanned = t => {
  const today = toISO(new Date());
  return data.events.filter(e => e.taskId === t.id && !e.done && e.date >= today).reduce((s, e) => s + evMinutes(e), 0);
};
const openTasks = () => data.tasks.filter(t => !t.done && !t.hidden).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));

function fmtDue(due) {
  const d = new Date(due);
  const days = Math.round((fromISO(toISO(d)) - fromISO(toISO(new Date()))) / 864e5);
  const when = days < 0 ? 'en retard' : days === 0 ? 'aujourd\'hui' : days === 1 ? 'demain' : `dans ${days} j`;
  return { days, label: `${when} · ${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// ---------- Import du calendrier Moodle (format iCalendar) ----------

const icsText = s => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

function icsDate(p) {
  if (!p) return null;
  const m = p.val.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m;
  // Heure UTC (Z) convertie en heure locale ; sinon on considère l'heure comme locale
  return z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

function parseICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') { if (cur) out.push(cur); cur = null; }
    else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(';');
      cur[name.toUpperCase()] = { val: line.slice(i + 1), params: params.join(';') };
    }
  }
  return out.map(e => ({
    uid: e.UID && e.UID.val,
    summary: icsText(e.SUMMARY ? e.SUMMARY.val : ''),
    start: icsDate(e.DTSTART),
    end: icsDate(e.DTEND),
    location: icsText(e.LOCATION ? e.LOCATION.val : ''),
    course: icsText(e.CATEGORIES ? e.CATEGORIES.val : ''),
    allDay: /VALUE=DATE(?!-)/.test(e.DTSTART ? e.DTSTART.params : ''),
  })).filter(e => e.uid && e.start);
}

const DEADLINE_RE = /(à remettre|a remettre|à rendre|à effectuer|doit être rendu|est dû|date limite|échéance|ferme\b|fermeture|closes|is due|\bdue\b)/i;
const OPENS_RE = /(\bouvre\b|ouverture|\bopens\b)/i;
const cleanTitle = s => s.replace(/\s*(est à remettre|doit être rendu|est à effectuer|est à rendre|est dû|ferme|closes|is due|due)\s*\.?$/i, '').trim();

// Cours → planning (catégorie Études) ; échéances → devoirs à rendre. Renvoie le nombre d'éléments.
function importCalendar(text) {
  const items = parseICS(text);
  if (!items.length) return 0;
  const today = toISO(new Date());
  const seen = new Set();
  items.forEach(it => {
    const id = `ics:${it.uid}`;
    if (OPENS_RE.test(it.summary)) return;
    seen.add(id);
    const instant = !it.end || it.end - it.start <= 60000;
    if (instant || DEADLINE_RE.test(it.summary)) {
      const title = cleanTitle(it.summary) || it.summary;
      let t = data.tasks.find(x => x.extId === id);
      if (!t) {
        t = { id: uid(), extId: id, source: 'moodle', title, estimate: defaultEstimate(title), done: false, notes: '' };
        data.tasks.push(t);
      }
      Object.assign(t, { title: t.renamed ? t.title : title, course: it.course, due: it.start.toISOString() });
    } else if (!it.allDay && toISO(it.start) === toISO(it.end)) {
      const fields = {
        title: it.summary, date: toISO(it.start), category: 'etudes', notes: it.location,
        start: `${pad(it.start.getHours())}:${pad(it.start.getMinutes())}`,
        end: `${pad(it.end.getHours())}:${pad(it.end.getMinutes())}`,
      };
      const e = data.events.find(x => x.extId === id);
      if (e) Object.assign(e, fields);
      else data.events.push({ id: uid(), extId: id, done: false, ...fields });
    }
  });
  // Ce qui a disparu du calendrier (à venir) est retiré
  data.events = data.events.filter(e => !(e.extId && !seen.has(e.extId) && e.date >= today && !e.done));
  data.tasks = data.tasks.filter(t => !(t.extId && !seen.has(t.extId) && !t.done && t.due >= new Date().toISOString()));
  return seen.size;
}

// ---------- Lecture ----------

const currentBook = () => data.books.find(b => b.status === 'reading');

// Vitesse de lecture apprise : pages par minute sur tes sessions notées (1 page/2 min par défaut)
function readingSpeed() {
  const log = data.books.flatMap(b => b.log || []);
  const pages = log.reduce((s, l) => s + l.pages, 0);
  const minutes = log.reduce((s, l) => s + l.minutes, 0);
  return minutes >= 30 && pages > 0 ? pages / minutes : 0.5;
}

function bookEta(b) {
  const p = readingProject();
  const perDay = (p ? p.weeklyMinutes : 140) / 7 * readingSpeed();
  const left = Math.max(0, (b.pages || 0) - (b.page || 0));
  return perDay > 0 && b.pages ? Math.ceil(left / perDay) : null;
}

function recommendBooks(n = 3) {
  const have = new Set(data.books.map(b => norm(b.title)));
  const w = {};
  const add = (t, x) => { w[t] = (w[t] || 0) + x; };
  data.projects.filter(p => p.active).forEach(p => {
    if (/aws|cloud/i.test(p.title)) { add('aws', 4); add('cloud', 2.5); add('devops', 1.5); }
    if (p.type === 'learning' || /program|code|dev|python|javascript/i.test(p.title)) add('prog', 3);
  });
  prefs().bookThemes.forEach(t => add(t, 2)); // goûts déclarés au questionnaire
  data.books.filter(b => b.status === 'done' && b.rating).forEach(b => (b.themes || []).forEach(t => add(t, (b.rating - 3) * 1.5)));
  // Niveau : nombre de livres techniques déjà lus (on commence par les plus accessibles)
  const techDone = data.books.filter(b => b.status === 'done' && (b.themes || []).some(t => TECH_THEMES.includes(t))).length;
  const recent = data.books.filter(b => b.status !== 'todo').slice(-2);
  const allTechLately = recent.length === 2 && recent.every(b => (b.themes || []).some(t => TECH_THEMES.includes(t)));
  const liked = data.books.filter(b => b.status === 'done' && b.rating >= 4);
  return BOOKS.filter(b => !have.has(norm(b.t))).map(b => {
    // Le thème le plus pertinent compte plein, les autres un peu
    const ws = b.th.map(t => w[t] || 0).sort((x, y) => y - x);
    let s = 1 + (ws[0] || 0) + ws.slice(1).reduce((a, x) => a + x * 0.2, 0);
    const tech = b.th.some(t => TECH_THEMES.includes(t));
    if (tech && b.lvl === 'avance' && techDone < 3) s -= 3;
    if (tech && b.lvl === 'intermediaire' && techDone < 1) s -= 1;
    if (allTechLately && !tech) s += 2.5;
    const likedSame = liked.find(x => (x.themes || []).some(t => b.th.includes(t)));
    let why = 'Un classique très apprécié';
    if (allTechLately && !tech) why = 'Pour souffler avec autre chose que la technique';
    else if (likedSame) why = `Tu as aimé « ${likedSame.title} »`;
    else if (b.th.includes('aws') && (w.aws || 0) > 0) why = b.lvl === 'debutant' ? 'Le guide de ta certification AWS' : 'Pour aller plus loin sur AWS';
    else if (b.th.includes('cloud') && (w.cloud || 0) > 0) why = 'Pour bien comprendre le cloud';
    else if (b.th.includes('devops') && (w.devops || 0) > 0) why = 'Le cloud vu côté pratique';
    else if (b.th.includes('prog') && (w.prog || 0) >= 3) why = b.lvl === 'debutant' ? 'Pour progresser en programmation, en douceur' : 'Pour progresser en programmation';
    return { book: b, score: s + Math.random() * 0.3, why };
  }).sort((x, y) => y.score - x.score).slice(0, n);
}

function addBook(b, status = 'todo') {
  if (!readingProject()) {
    data.projects.push(newProject('reading'));
    toast('Projet Lecture créé (20 min par jour), modifiable dans Objectifs');
  }
  const book = { id: uid(), title: b.t || b.title, author: b.a || b.author || '', pages: b.p || b.pages || 0, page: 0, themes: b.th || b.themes || [], status, rating: 0, log: [] };
  if (status === 'reading' || (!currentBook() && status === 'todo')) book.status = 'reading';
  data.books.push(book);
  return book;
}

// Après une session de lecture marquée « faite » : page atteinte, et note si le livre est fini
function afterReadingSession(ev) {
  const b = currentBook();
  if (!b) return;
  const v = prompt(`Tu es à quelle page de « ${b.title} »${b.pages ? ` (sur ${b.pages})` : ''} ?`, b.page || '');
  const page = parseInt(v, 10);
  if (isNaN(page) || page < (b.page || 0)) return;
  (b.log ||= []).push({ date: ev.date, minutes: evMinutes(ev), pages: page - (b.page || 0) });
  b.page = page;
  if (b.pages && page >= b.pages) finishBook(b);
}

function finishBook(b) {
  b.status = 'done';
  b.finished = toISO(new Date());
  const r = parseInt(prompt(`Bravo, « ${b.title} » est fini ! Ta note de 1 à 5 ?`, '4'), 10);
  if (r >= 1 && r <= 5) b.rating = r;
  const next = data.books.find(x => x.status === 'todo');
  if (next) next.status = 'reading';
}

// Appelé quand une activité passe à « faite »
function onEventDone(ev) {
  const p = ev.projectId && data.projects.find(x => x.id === ev.projectId);
  if (p && p.type === 'reading') afterReadingSession(ev);
  const t = ev.taskId && data.tasks.find(x => x.id === ev.taskId);
  if (t && taskSpent(t) >= t.estimate) toast(`Temps prévu atteint pour « ${t.title} ». Terminé ? Coche-le dans Objectifs.`);
}

// ---------- Planification des sessions (devoirs puis projets) ----------
// Les sessions de travail vont en fin de journée en semaine, en journée le week-end
// (plages calculées à partir de tes horaires : voir workWindow() et readingWindow()).

const MAX_WORK_PER_DAY = 2;
// Charge d'une journée : sessions et loisirs proposés ou prévus (la lecture du soir ne compte pas)
const MAX_PER_DAY_TOTAL = { week: 2, weekend: 3 };
const isReadingSession = x => { const p = x.projectId && data.projects.find(q => q.id === x.projectId); return !!(p && p.type === 'reading'); };
// (le travail et les cours ne comptent pas : ils sont hors des plages libres ; la lecture du soir non plus)
function dayLoad(iso, ctx) {
  return ctx.props.filter(p => p.date === iso && !isReadingSession(p)).length
    + data.events.filter(e => e.date === iso && !['travail', 'etudes'].includes(e.category) && !isReadingSession(e)
      && (e.taskId || e.projectId || e.routineId)).length
    + data.events.filter(e => e.date === iso && e.taskId && e.category === 'etudes').length;
}
const dayCap = iso => (weekdayOf(iso) >= 5 ? MAX_PER_DAY_TOTAL.weekend : MAX_PER_DAY_TOTAL.week);

// Place une session dans le premier créneau libre qui convient ; renvoie la minute de début ou null
function placeSession(ctx, iso, dur, win, prefer) {
  const from = iso === ctx.today ? roundTo(nowMinutes() + 30) : 0;
  const slots = freeSlots(iso, from, ctx.busy[iso] || [], win).filter(([s, e]) => e - s >= dur);
  if (!slots.length) return null;
  let start = slots[0][0];
  if (prefer != null) {
    const ok = slots.find(([s, e]) => prefer >= s && prefer + dur <= e);
    if (ok) start = prefer;
  }
  (ctx.busy[iso] ||= []).push([start, start + dur]);
  return start;
}

function planWorkSessions(weekStart, ctx) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const iso = toISO(addDays(weekStart, i));
    if (iso >= ctx.today) days.push(iso);
  }
  const winFor = workWindow;
  const count = iso => dayLoad(iso, ctx);
  const push = (iso, start, dur, extra) => ctx.props.push({
    id: uid(), date: iso, start: fromMin(start), end: fromMin(Math.min(start + dur, 23 * 60 + 59)), ...extra,
  });

  // 1. Devoirs : le temps restant est réparti sur les semaines avant l'échéance
  openTasks().filter(t => t.due).forEach(t => {
    const dueDay = toISO(new Date(t.due));
    const remaining = t.estimate - taskSpent(t) - taskPlanned(t);
    if (remaining < 30 || dueDay <= ctx.today) return;
    const weeksLeft = Math.max(1, Math.ceil(daysBetween(ctx.today, dueDay) / 7));
    let budget = Math.ceil(remaining / weeksLeft / 15) * 15;
    for (const iso of days) {
      if (budget < 30) break;
      if (iso >= dueDay || count(iso) >= MAX_WORK_PER_DAY) continue;
      if (ctx.props.some(p => p.taskId === t.id && p.date === iso)) continue;
      const dur = Math.min(90, Math.max(30, budget));
      const start = placeSession(ctx, iso, dur, winFor(iso));
      if (start === null) continue;
      push(iso, start, dur, { kind: 'task', taskId: t.id, title: `📚 ${t.title}`, category: 'etudes' });
      budget -= dur;
    }
  });

  // 2. Projets : compléter le temps hebdomadaire visé, en espaçant les sessions
  data.projects.filter(p => p.active && p.weeklyMinutes > 0).forEach(p => {
    let left = p.weeklyMinutes - projectMinutes(p, days[0] || ctx.today, true);
    const reading = p.type === 'reading';
    const dur = p.session || 60;
    const order = [...days.filter((_, i) => i % 2 === 0), ...days.filter((_, i) => i % 2 === 1)];
    for (const iso of order) {
      if (left < dur / 2) break;
      if (!reading && count(iso) >= MAX_WORK_PER_DAY) continue;
      if (data.events.some(e => e.projectId === p.id && e.date === iso) || ctx.props.some(x => x.projectId === p.id && x.date === iso)) continue;
      const prefer = projectUsualStart(p, iso) ?? (reading ? 21 * 60 + 30 : null);
      const start = placeSession(ctx, iso, dur, reading ? readingWindow() : winFor(iso), prefer);
      if (start === null) continue;
      const next = p.steps.find(st => !st.done);
      push(iso, start, dur, { kind: 'project', projectId: p.id, title: sessionTitle(p), category: p.category, notes: next ? `Étape : ${next.title}` : '' });
      left -= dur;
    }
  });
}

// ---------- Onglet Objectifs ----------

function renderGoals() {
  const tasks = openTasks();
  const doneCount = data.tasks.filter(t => t.done && !t.hidden).length;
  const rp = readingProject();
  let html = `
    <div class="header"><h1>Objectifs</h1>
      <button class="icon-btn" data-action="new-project" aria-label="Nouveau projet">+</button></div>
    <p class="subtitle">Cours, devoirs, projets perso et lecture</p>
    <button class="primary" data-action="plan-goals">✨ Planifier mes sessions de la semaine</button>

    <div class="section-title row-title"><span>À rendre</span><button class="text-btn" data-action="new-task" style="padding:0">+ Ajouter</button></div>
    ${data.settings.calSyncedAt
      ? `<p class="help" style="margin:0 4px 8px">🎓 Moodle synchronisé ${fmtAgo(data.settings.calSyncedAt)}</p>`
      : '<p class="help" style="margin:0 4px 8px"><button class="text-btn" data-action="moodle-help" style="padding:0">Connecter Moodle</button> pour importer cours et devoirs automatiquement.</p>'}`;

  html += tasks.length ? `<div class="list">${tasks.map(t => {
    const spent = taskSpent(t);
    const due = t.due ? fmtDue(t.due) : null;
    return `
      <button class="idea food-item" data-action="edit-task" data-id="${t.id}">
        <span class="idea-main">
          <div class="idea-title">${esc(t.title)}</div>
          <div class="idea-meta">${t.course ? `${esc(t.course)} · ` : ''}${due ? due.label : 'sans date'}</div>
          <div class="meter small"><div class="meter-fill" style="width:${Math.min(100, (spent / t.estimate) * 100)}%"></div></div>
          <div class="idea-meta">${fmtDuration(spent)} / ${fmtDuration(t.estimate)} · ${fmtDuration(taskPlanned(t))} prévues</div>
        </span>
        ${due ? `<span class="badge ${due.days <= 2 ? 'urgent' : due.days <= 7 ? 'soon' : ''}">${due.days < 0 ? 'retard' : `J-${due.days}`}</span>` : ''}
      </button>`;
  }).join('')}</div>` : '<p class="help" style="margin:0 4px 8px">Rien à rendre pour l\'instant 🎉</p>';
  if (doneCount) html += `<p class="help" style="margin:6px 4px 0">${doneCount} terminé${doneCount > 1 ? 's' : ''}</p>`;

  html += '<div class="section-title">Projets</div>';
  const projects = data.projects.filter(p => p.active);
  html += projects.length ? projects.map(p => {
    const week = projectMinutes(p, toISO(new Date()));
    const planned = projectMinutes(p, toISO(new Date()), true);
    const steps = p.steps.length;
    const doneSteps = p.steps.filter(s => s.done).length;
    const next = p.steps.find(s => !s.done);
    return `
      <button class="card project-card" data-action="edit-project" data-id="${p.id}">
        <div class="idea-title">${p.icon} ${esc(p.title)}</div>
        <div class="idea-meta">Cette semaine : ${fmtDuration(week)} / ${fmtDuration(p.weeklyMinutes)}${planned > week ? ` (+${fmtDuration(planned - week)} prévues)` : ''}</div>
        <div class="meter small"><div class="meter-fill" style="width:${Math.min(100, (week / p.weeklyMinutes) * 100)}%"></div></div>
        ${steps ? `<div class="idea-meta">${doneSteps}/${steps} étapes${next ? ` · Prochaine : ${esc(next.title)}` : ' · terminé 🎉'}</div>` : ''}
        ${p.deadline ? `<div class="idea-meta">Objectif : ${fmtShort(fromISO(p.deadline))}</div>` : ''}
      </button>`;
  }).join('') : '<p class="help" style="margin:0 4px 8px">Aucun projet. Touche + pour en créer un (AWS, programmation, lecture…).</p>';

  // Lecture
  const cur = currentBook();
  const todo = data.books.filter(b => b.status === 'todo');
  html += `<div class="section-title row-title"><span>Lecture</span><button class="text-btn" data-action="new-book" style="padding:0">+ Livre</button></div>`;
  if (cur) {
    const eta = bookEta(cur);
    html += `
      <button class="card project-card" data-action="edit-book" data-id="${cur.id}">
        <div class="idea-title">📖 ${esc(cur.title)}</div>
        <div class="idea-meta">${esc(cur.author)}${cur.pages ? ` · page ${cur.page || 0} / ${cur.pages}` : ''}</div>
        ${cur.pages ? `<div class="meter small"><div class="meter-fill" style="width:${Math.min(100, ((cur.page || 0) / cur.pages) * 100)}%"></div></div>` : ''}
        ${eta !== null ? `<div class="idea-meta">≈ fini dans ${eta} jour${eta > 1 ? 's' : ''} à ton rythme${rp ? ` (${fmtDuration(Math.round(rp.weeklyMinutes / 7))}/jour)` : ''}</div>` : ''}
      </button>`;
  }
  if (todo.length) {
    html += `<div class="list">${todo.map(b => `
      <button class="idea food-item" data-action="edit-book" data-id="${b.id}">
        <span class="idea-main"><div class="idea-title">${esc(b.title)}</div><div class="idea-meta">${esc(b.author)}${b.pages ? ` · ${b.pages} p.` : ''} · à lire</div></span>
      </button>`).join('')}</div>`;
  }
  const recs = recommendBooks(3);
  if (recs.length) {
    html += `<div class="section-title">Suggestions pour toi</div><div class="list">${recs.map(r => `
      <div class="idea">
        <span class="idea-main"><div class="idea-title">${esc(r.book.t)}</div><div class="idea-meta">${esc(r.book.a)} · ${r.book.p} p. · ${esc(r.why)}</div></span>
        <button class="plan-btn" data-action="add-rec" data-title="${esc(r.book.t)}">+ Ajouter</button>
      </div>`).join('')}</div>
      <button class="secondary" data-action="books-chatgpt" style="margin-top:10px">💬 Plus d'idées de livres avec ChatGPT</button>`;
  }
  view.innerHTML = html;
}

// ---------- Formulaires ----------

function openTaskSheet(t, isNew) {
  const due = t.due ? new Date(t.due) : null;
  const dueLocal = due ? `${toISO(due)}T${pad(due.getHours())}:${pad(due.getMinutes())}` : '';
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="text-btn" data-close>Annuler</button>
      <h2>${isNew ? 'Nouveau devoir' : 'Devoir'}</h2>
      <button type="submit" class="text-btn">OK</button>
    </div>
    <div class="field">
      <label><input type="text" name="title" placeholder="Ex : Rapport de TP réseaux" value="${esc(t.title)}" required></label>
      <label>Matière <input type="text" name="course" value="${esc(t.course || '')}" placeholder="facultatif"></label>
    </div>
    <div class="field">
      <label>À rendre le <input type="datetime-local" name="due" value="${dueLocal}"></label>
      <label>Temps estimé (h) <input type="number" name="estimate" min="0.5" step="0.5" inputmode="decimal" value="${t.estimate / 60}" required></label>
      <label>Terminé <input type="checkbox" name="done" ${t.done ? 'checked' : ''}></label>
    </div>
    <p class="help" style="margin:-4px 4px 10px">Déjà fait : ${fmtDuration(taskSpent(t))} · prévu : ${fmtDuration(taskPlanned(t))}${t.source === 'moodle' ? ' · importé de Moodle' : ''}</p>
    <div class="field"><label><textarea name="notes" placeholder="Notes, consignes…">${esc(t.notes || '')}</textarea></label></div>
    ${isNew ? '' : '<button type="button" class="danger" data-delete>Supprimer</button>'}`;
  sheetForm.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    const title = f.get('title').trim();
    if (t.source === 'moodle' && title !== t.title) t.renamed = true;
    Object.assign(t, {
      title, course: f.get('course').trim(), due: f.get('due') ? new Date(f.get('due')).toISOString() : '',
      estimate: Math.max(30, Math.round(parseFloat(String(f.get('estimate')).replace(',', '.')) * 60) || 120),
      done: f.get('done') === 'on', notes: f.get('notes').trim(),
    });
    if (isNew) data.tasks.push(t);
    save();
    sheet.close();
    render();
  };
  // Un devoir importé n'est pas supprimé (il reviendrait au prochain import) mais masqué
  bindSheetButtons(() => {
    if (t.extId) t.hidden = true;
    else data.tasks = data.tasks.filter(x => x !== t);
    data.events = data.events.filter(e => !(e.taskId === t.id && !e.done));
  });
  sheet.showModal();
}

function openProjectPicker() {
  sheetForm.innerHTML = `
    <div class="sheet-head"><button type="button" class="text-btn" data-close>Annuler</button><h2>Nouveau projet</h2><span></span></div>
    ${[['aws', '☁️ Certification AWS', 'Programme en 10 étapes, 2 h 30 par semaine'],
      ['code', '💻 Progresser en programmation', '7 étapes, 3 h par semaine'],
      ['reading', '📖 Lecture', '20 min par jour, suivi des pages, suggestions de livres'],
      ['custom', '🎯 Autre projet', 'Ton propre objectif, tes étapes']]
      .map(([k, t, d]) => `<button type="button" class="card project-card" data-kind="${k}"><div class="idea-title">${t}</div><div class="idea-meta">${d}</div></button>`).join('')}`;
  sheetForm.onsubmit = e => e.preventDefault();
  sheetForm.querySelector('[data-close]').onclick = () => sheet.close();
  sheetForm.querySelectorAll('[data-kind]').forEach(b => {
    b.onclick = () => {
      const p = newProject(b.dataset.kind);
      sheet.close();
      openProjectSheet(p, true);
    };
  });
  sheet.showModal();
}

function openProjectSheet(p, isNew) {
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="text-btn" data-close>Annuler</button>
      <h2>${isNew ? 'Nouveau projet' : 'Projet'}</h2>
      <button type="submit" class="text-btn">OK</button>
    </div>
    <div class="field">
      <label><input type="text" name="title" placeholder="Nom du projet" value="${esc(p.title)}" required></label>
      <label>Icône <input type="text" name="icon" value="${esc(p.icon)}" maxlength="4" style="max-width:60px"></label>
    </div>
    <div class="field">
      <label>Heures par semaine <input type="number" name="weekly" min="0" step="0.5" inputmode="decimal" value="${p.weeklyMinutes / 60}"></label>
      <label>Durée d'une session (min) <input type="number" name="session" min="15" step="15" inputmode="numeric" value="${p.session}"></label>
      <label>Objectif pour le <input type="date" name="deadline" value="${p.deadline || ''}"></label>
      <label>Catégorie <select name="category">${catOptions(p.category)}</select></label>
    </div>
    ${p.type === 'reading' ? '' : `
    <div class="section-title">Étapes</div>
    <div class="field">
      ${p.steps.map(s => `<label class="step"><span>${esc(s.title)}</span><input type="checkbox" name="step-${s.id}" ${s.done ? 'checked' : ''}></label>`).join('')}
      <label><input type="text" name="newstep" placeholder="+ Ajouter une étape"></label>
    </div>`}
    <div class="field"><label><textarea name="notes" placeholder="Notes, ressources…">${esc(p.notes || '')}</textarea></label></div>
    ${isNew ? '' : '<button type="button" class="danger" data-delete>Supprimer le projet</button>'}`;
  sheetForm.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    p.steps.forEach(s => { s.done = f.get(`step-${s.id}`) === 'on'; });
    const ns = (f.get('newstep') || '').trim();
    if (ns) p.steps.push({ id: uid(), title: ns, done: false });
    Object.assign(p, {
      title: f.get('title').trim(), icon: f.get('icon').trim() || '🎯',
      weeklyMinutes: Math.round(parseFloat(String(f.get('weekly')).replace(',', '.')) * 60) || 0,
      session: Math.max(15, parseInt(f.get('session'), 10) || 60), deadline: f.get('deadline'),
      category: f.get('category'), notes: f.get('notes').trim(),
    });
    if (isNew) data.projects.push(p);
    save();
    sheet.close();
    render();
    if (ns) openProjectSheet(p, false); // pour enchaîner plusieurs étapes
  };
  bindSheetButtons(() => {
    data.projects = data.projects.filter(x => x !== p);
    data.events = data.events.filter(e => !(e.projectId === p.id && !e.done));
  });
  sheet.showModal();
}

function openBookSheet(b, isNew) {
  sheetForm.innerHTML = `
    <div class="sheet-head">
      <button type="button" class="text-btn" data-close>Annuler</button>
      <h2>${isNew ? 'Nouveau livre' : 'Livre'}</h2>
      <button type="submit" class="text-btn">OK</button>
    </div>
    <div class="field">
      <label><input type="text" name="title" placeholder="Titre" value="${esc(b.title)}" required></label>
      <label>Auteur <input type="text" name="author" value="${esc(b.author)}"></label>
      <label>Pages <input type="number" name="pages" min="0" inputmode="numeric" value="${b.pages || ''}"></label>
    </div>
    <div class="field">
      <label>Statut <select name="status">${[['todo', 'À lire'], ['reading', 'En cours'], ['done', 'Lu']].map(([k, v]) => `<option value="${k}" ${k === b.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Page actuelle <input type="number" name="page" min="0" inputmode="numeric" value="${b.page || 0}"></label>
      <label>Note <select name="rating"><option value="0">–</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === b.rating ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}</select></label>
    </div>
    ${isNew ? '' : '<button type="button" class="danger" data-delete>Supprimer</button>'}`;
  sheetForm.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    const status = f.get('status');
    if (status === 'reading') data.books.forEach(x => { if (x !== b && x.status === 'reading') x.status = 'todo'; });
    Object.assign(b, {
      title: f.get('title').trim(), author: f.get('author').trim(), pages: parseInt(f.get('pages'), 10) || 0,
      page: parseInt(f.get('page'), 10) || 0, status, rating: parseInt(f.get('rating'), 10) || 0,
    });
    if (status === 'done' && !b.finished) b.finished = toISO(new Date());
    if (isNew) { const nb = addBook(b, status); Object.assign(nb, { page: b.page, rating: b.rating }); }
    save();
    sheet.close();
    render();
  };
  bindSheetButtons(() => { data.books = data.books.filter(x => x !== b); });
  sheet.showModal();
}

function openMoodleHelp() {
  sheetForm.innerHTML = `
    <div class="sheet-head"><span></span><h2>Connecter Moodle</h2><button type="button" class="text-btn" data-close>OK</button></div>
    <p class="help" style="margin:0 4px 10px">Tes identifiants ne sont jamais demandés : on utilise le lien privé d'export du calendrier Moodle.</p>
    <div class="card help-steps">
      <p><b>1.</b> Sur Moodle : <b>Calendrier</b> → <b>Importer ou exporter des calendriers</b> → <b>Exporter le calendrier</b>. Choisis « Tous les cours » et « Événements récents et à venir », puis <b>Obtenir l'adresse URL du calendrier</b> et copie-la.</p>
      <p><b>2.</b> La synchro automatique (Réglages → Pas) doit être activée : les cours passent par le même gist secret.</p>
      <p><b>3.</b> Dans le dépôt GitHub, ajoute 3 secrets (Settings → Secrets and variables → Actions) : <b>MOODLE_ICS_URL</b> (le lien Moodle ; tu peux ajouter l'emploi du temps sur une 2e ligne), <b>GIST_ID</b> (la fin de l'adresse du gist) et <b>GIST_TOKEN</b> (la clé « gist » déjà créée pour les pas).</p>
      <p><b>4.</b> Onglet <b>Actions</b> → <b>Import calendrier</b> → <b>Run workflow</b>. Ensuite, c'est automatique toutes les 3 heures.</p>
    </div>
    <button type="button" class="secondary" id="ics-file">Ou importer un fichier .ics</button>`;
  sheetForm.onsubmit = e => e.preventDefault();
  sheetForm.querySelector('[data-close]').onclick = () => sheet.close();
  sheetForm.querySelector('#ics-file').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics,text/calendar';
    input.onchange = async () => {
      const n = importCalendar(await input.files[0].text());
      save();
      sheet.close();
      render();
      toast(n ? `${n} éléments importés` : 'Aucun événement trouvé dans ce fichier');
    };
    input.click();
  };
  sheet.showModal();
}

function booksChatGPT() {
  const read = data.books.filter(b => b.status !== 'todo').map(b => `${b.title}${b.rating ? ` (${b.rating}/5)` : ''}`);
  const goals = data.projects.filter(p => p.active && p.type !== 'reading').map(p => p.title);
  const q = 'Propose-moi 5 livres à lire, avec pour chacun : titre | auteur | pourquoi pour moi (une phrase). ' +
    (goals.length ? `Mes objectifs du moment : ${goals.join(', ')}. ` : '') +
    (read.length ? `J'ai déjà lu : ${read.join(', ')}. ` : '') +
    'Mélange livres utiles pour mes objectifs et un ou deux livres pour me détendre.';
  window.open(`https://chatgpt.com/?q=${encodeURIComponent(q)}`, '_blank');
}
