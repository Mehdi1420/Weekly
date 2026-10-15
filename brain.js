'use strict';

// ---------- Moteur d'apprentissage ----------
// Tout est calculé sur le téléphone à partir de l'historique :
// - routines : activités qui se répètent, créées à la main ou détectées automatiquement ;
// - habitudes : jours, heures et catégories que tu fais le plus, pour noter les suggestions ;
// - repas habituels : ce que tu manges le plus souvent à chaque repas.

const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const REPEATS = {
  none: 'Jamais',
  week: 'Chaque semaine',
  weekdays: 'En semaine (lun–ven)',
  weekend: 'Le week-end',
  daily: 'Tous les jours',
};
// Les plages libres viennent des préférences (questionnaire de bienvenue) : voir leisureWindow()
const MAX_WEEK_PROPOSALS = 5;
const MAX_PER_DAY = { week: 1, weekend: 2 };

const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const median = arr => {
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const roundTo = (min, step = 15) => Math.round(min / step) * step;
const weekdayOf = iso => (fromISO(iso).getDay() + 6) % 7; // 0 = lundi
const daysBetween = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 864e5);
const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

function learn() {
  if (!data.learn) data.learn = { dismissed: {}, rejected: {} };
  return data.learn;
}

function daysLabel(days) {
  const k = [...days].sort().join('');
  if (k === '0123456') return 'tous les jours';
  if (k === '01234') return 'en semaine';
  if (k === '56') return 'le week-end';
  const names = days.map(d => DAY_NAMES[d]);
  return `le ${names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}` : names[0]}`;
}

// ---------- Routines ----------

function repeatDays(repeat, iso) {
  return { week: [weekdayOf(iso)], weekdays: [0, 1, 2, 3, 4], weekend: [5, 6], daily: [0, 1, 2, 3, 4, 5, 6] }[repeat] || [];
}

function routineOf(ev) {
  return ev && ev.routineId ? data.routines.find(r => r.id === ev.routineId) : null;
}

// Crée les occurrences des routines pour une semaine (à partir d'aujourd'hui, jamais dans le passé)
function materializeRoutines(weekStart) {
  const today = toISO(new Date());
  let changed = false;
  for (let i = 0; i < 7; i++) {
    const iso = toISO(addDays(weekStart, i));
    if (iso < today) continue;
    data.routines.forEach(r => {
      if (!r.days.includes(i) || iso < r.from || r.skips.includes(iso)) return;
      if (data.events.some(e => e.routineId === r.id && e.date === iso)) return;
      data.events.push({
        id: uid(), title: r.title, date: iso, start: r.start, end: r.end,
        category: r.category, notes: r.notes || '', done: false, routineId: r.id,
        ...(r.projectId ? { projectId: r.projectId } : {}),
      });
      changed = true;
    });
  }
  if (changed) save();
}

// Applique le choix « Répéter » du formulaire d'une activité
function applyRepeat(ev, repeat) {
  const today = toISO(new Date());
  const r = routineOf(ev);
  const futureOthers = r ? data.events.filter(e => e.routineId === r.id && e.id !== ev.id && e.date >= today && !e.done) : [];
  if (repeat === 'none') {
    if (r) {
      data.routines = data.routines.filter(x => x !== r);
      data.events = data.events.filter(e => !futureOthers.includes(e));
      delete ev.routineId;
    }
    return;
  }
  const days = repeat === 'custom' && r ? r.days : repeatDays(repeat, ev.date);
  const fields = { title: ev.title, category: ev.category, start: ev.start, end: ev.end, notes: ev.notes, repeat, days };
  if (r) {
    Object.assign(r, fields);
    // Les occurrences à venir sont recréées avec les nouveaux réglages
    data.events = data.events.filter(e => !futureOthers.includes(e));
  } else {
    const nr = { id: uid(), ...fields, from: ev.date, skips: [] };
    data.routines.push(nr);
    ev.routineId = nr.id;
  }
}

function skipOccurrence(ev) {
  const r = routineOf(ev);
  if (r && !r.skips.includes(ev.date)) r.skips.push(ev.date);
  data.events = data.events.filter(e => e.id !== ev.id);
}

function stopRoutine(ev) {
  const r = routineOf(ev);
  const today = toISO(new Date());
  if (r) {
    data.routines = data.routines.filter(x => x !== r);
    data.events = data.events.filter(e => !(e.routineId === r.id && e.date >= today && !e.done));
  }
  data.events = data.events.filter(e => e.id !== ev.id);
}

function routineFromSuggestion(s) {
  const r = { id: uid(), title: s.title, category: s.category, start: s.start, end: s.end, notes: '', repeat: 'custom', days: s.days, from: toISO(new Date()), skips: [] };
  data.routines.push(r);
  // Les anciennes occurrences saisies à la main deviennent celles de la routine (pour cette semaine et après)
  const today = toISO(new Date());
  data.events.forEach(e => { if (!e.routineId && norm(e.title) === s.key && e.date >= today && r.days.includes(weekdayOf(e.date))) e.routineId = r.id; });
  return r;
}

// ---------- Détection automatique des routines ----------
// Une activité saisie à la main au moins 2 semaines, le même jour, une semaine sur deux ou plus
// (sur les 8 dernières semaines) est proposée comme routine.

function detectRoutines() {
  const today = toISO(new Date());
  const since = toISO(addDays(new Date(), -56));
  const groups = {};
  data.events.forEach(e => {
    if (e.routineId || !e.title || e.date < since || e.date > today) return;
    (groups[norm(e.title)] ||= []).push(e);
  });
  const known = new Set(data.routines.map(r => norm(r.title)));
  const out = [];
  Object.entries(groups).forEach(([key, list]) => {
    if (learn().dismissed[key] || known.has(key)) return;
    const first = list.reduce((m, e) => (e.date < m ? e.date : m), list[0].date);
    const weeks = Math.floor(daysBetween(toISO(startOfWeek(fromISO(first))), today) / 7) + 1;
    const byDay = {};
    list.forEach(e => { (byDay[weekdayOf(e.date)] ||= new Set()).add(isoWeekKey(e.date)); });
    const days = Object.entries(byDay).filter(([, w]) => w.size >= 2 && w.size / weeks >= 0.5).map(([d]) => +d).sort();
    if (!days.length) return;
    const sel = list.filter(e => days.includes(weekdayOf(e.date)));
    const start = roundTo(median(sel.map(e => toMin(e.start))));
    const dur = Math.max(15, roundTo(median(sel.map(durMin))));
    const cats = {};
    sel.forEach(e => { cats[e.category] = (cats[e.category] || 0) + 1; });
    out.push({
      key, title: sel.at(-1).title, category: Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0],
      days, start: fromMin(start), end: fromMin(Math.min(start + dur, 23 * 60 + 59)), count: sel.length,
    });
  });
  return out.sort((a, b) => b.count - a.count);
}

// ---------- Suggestions d'activités ----------

const sportCount = (ws, we) => data.events.filter(e => e.category === 'sport' && e.date >= ws && e.date <= we).length;

const timeBucket = m => (m < 12 * 60 ? 0 : m < 17 * 60 ? 1 : 2);

// Plus le score est haut, plus l'idée colle à tes habitudes et à ce qui manque cette semaine
function scoreIdea(idea, iso, startMin) {
  const key = norm(idea.title);
  const today = toISO(new Date());
  const ws = toISO(startOfWeek(fromISO(iso)));
  const we = toISO(addDays(fromISO(ws), 6));
  const past = data.events.filter(e => norm(e.title) === key && e.date <= today && (e.done || e.date < today || !e.routineId));
  let score = 1;
  score += past.filter(e => weekdayOf(e.date) === weekdayOf(iso)).length * 1.5; // ce jour-là d'habitude
  if (startMin != null) score += past.filter(e => timeBucket(toMin(e.start)) === timeBucket(startMin)).length * 0.5;
  const last = past.reduce((m, e) => (e.date > m ? e.date : m), '');
  score += last ? Math.min(daysBetween(last, today) / 7, 2) : 1; // pas fait depuis longtemps
  // Équilibre : une catégorie que tu pratiques d'habitude mais absente cette semaine
  const inWeek = data.events.some(e => e.category === idea.category && e.date >= ws && e.date <= we);
  const usual = data.events.some(e => e.category === idea.category && e.date < ws && e.date >= toISO(addDays(fromISO(ws), -28)));
  if (!inWeek) score += usual ? 2 : 0.5;
  if (data.events.some(e => norm(e.title) === key && e.date >= ws && e.date <= we)) score -= 3; // déjà prévu
  // Objectif de séances de sport par semaine (questionnaire)
  if (idea.category === 'sport' && sportCount(ws, we) < prefs().sportPerWeek) score += 2.5;
  score -= (learn().rejected[key] || 0) * 0.7; // suggestions refusées
  return score;
}

// Créneaux libres d'une journée dans une plage horaire, en tenant compte des activités
// et des créneaux déjà réservés par d'autres propositions (`extra`)
function freeSlots(iso, from = 0, extra = [], win = null) {
  const [a, b] = win || leisureWindow(iso);
  // Les soirées de la veille qui finissent après minuit occupent aussi le début de journée
  const prevNight = eventsOn(toISO(addDays(fromISO(iso), -1))).filter(overnight).map(e => [0, toMin(e.end)]);
  const busy = [...eventsOn(iso).map(e => [toMin(e.start), endMin(e)]), ...prevNight, ...extra].sort((x, y) => x[0] - y[0]);
  let cur = Math.max(a, from);
  const slots = [];
  for (const [s, e] of busy) {
    if (e <= cur) continue;
    if (s > cur) slots.push([cur, Math.min(s, b)]);
    cur = Math.max(cur, e);
    if (cur >= b) break;
  }
  if (cur < b) slots.push([cur, b]);
  return slots.filter(([s, e]) => e - s >= 30);
}

// Heure habituelle d'une activité (même jour de la semaine si possible), arrondie au quart d'heure
function usualStart(title, iso) {
  const key = norm(title);
  const past = data.events.filter(e => norm(e.title) === key);
  if (!past.length) return null;
  const sameDay = past.filter(e => weekdayOf(e.date) === weekdayOf(iso));
  return roundTo(median((sameDay.length ? sameDay : past).map(e => toMin(e.start))));
}

// Meilleures idées pour un créneau, chacune placée à son heure habituelle si elle tient dedans
// Une idée déjà couverte par une routine (« Football » quand il y a la routine « Foot ») n'est pas proposée
function coveredByRoutine(idea) {
  const k = norm(idea.title);
  return data.routines.some(r => { const rk = norm(r.title); return rk === k || (rk.length >= 4 && (k.includes(rk) || rk.includes(k))); });
}

function bestIdeas(iso, slot, exclude = new Set()) {
  return data.ideas
    .filter(i => i.duration <= slot[1] - slot[0] && !exclude.has(i.id) && !coveredByRoutine(i))
    .map(i => {
      const u = usualStart(i.title, iso) ?? (i.at ? toMin(i.at) : null);
      const fits = u !== null && u >= slot[0] && u + i.duration <= slot[1];
      const start = fits ? u : slot[0];
      return { idea: i, start, timed: fits, score: scoreIdea(i, iso, start) + (fits ? 1 : 0) };
    })
    .sort((x, y) => y.score - x.score);
}

// Semaine proposée, dans cet ordre : sessions pour les devoirs, sessions des projets perso,
// puis loisirs (les meilleures paires jour/idée d'abord, une idée au plus une fois,
// une par soir de semaine et deux par jour de week-end), sans chevauchement
function proposeWeek(weekStart) {
  const ctx = { today: toISO(new Date()), busy: {}, props: [] };
  planWorkSessions(weekStart, ctx);
  const pairs = [];
  for (let i = 0; i < 7; i++) {
    const iso = toISO(addDays(weekStart, i));
    if (iso < ctx.today) continue;
    freeSlots(iso, iso === ctx.today ? roundTo(nowMinutes() + 30) : 0, ctx.busy[iso] || [])
      .forEach(slot => bestIdeas(iso, slot).forEach(r => pairs.push({ iso, ...r })));
  }
  pairs.sort((x, y) => y.score - x.score);
  const uses = {};
  let ideas = 0;
  let sports = sportCount(toISO(weekStart), toISO(addDays(weekStart, 6)));

  // Essaie de placer une paire (jour, idée) ; décale au prochain créneau libre si besoin
  const tryPlace = p => {
    if (ideas >= MAX_WEEK_PROPOSALS) return false;
    const sameDay = ctx.props.filter(x => x.date === p.iso && x.kind === 'idea');
    if (sameDay.length >= (weekdayOf(p.iso) >= 5 ? MAX_PER_DAY.weekend : MAX_PER_DAY.week)) return false;
    if (sameDay.some(x => x.ideaId === p.idea.id)) return false;
    if (dayLoad(p.iso, ctx) >= dayCap(p.iso)) return false; // journée déjà bien remplie
    let start = p.start;
    let end = Math.min(start + p.idea.duration, 23 * 60 + 59);
    if ((ctx.busy[p.iso] || []).some(([s, e]) => start < e && end > s)) {
      // Créneau pris : on se place au plus près de l'heure voulue ; une activité qui a une heure
      // naturelle (dîner le soir…) n'est pas déplacée de plus de 2 h
      const from = p.iso === ctx.today ? roundTo(nowMinutes() + 30) : 0;
      const options = freeSlots(p.iso, from, ctx.busy[p.iso] || [])
        .filter(([s, e]) => e - s >= p.idea.duration)
        .map(([s, e]) => Math.min(Math.max(p.start, s), e - p.idea.duration))
        .sort((x, y) => Math.abs(x - p.start) - Math.abs(y - p.start));
      if (!options.length || (p.timed && Math.abs(options[0] - p.start) > 120)) return false;
      start = options[0];
      end = Math.min(start + p.idea.duration, 23 * 60 + 59);
    }
    uses[p.idea.id] = (uses[p.idea.id] || 0) + 1;
    ideas++;
    if (p.idea.category === 'sport') sports++;
    (ctx.busy[p.iso] ||= []).push([start, end]);
    ctx.props.push({ id: uid(), kind: 'idea', ideaId: p.idea.id, title: p.idea.title, category: p.idea.category, date: p.iso, start: fromMin(start), end: fromMin(end) });
    return true;
  };

  // 1. Sport d'abord, jusqu'à l'objectif de séances : on varie les sports avant d'en répéter un
  const sportPairs = pairs.filter(p => p.idea.category === 'sport');
  while (sports < prefs().sportPerWeek) {
    const next = [...sportPairs].sort((x, y) => (uses[x.idea.id] || 0) - (uses[y.idea.id] || 0) || y.score - x.score).find(tryPlace);
    if (!next) break;
  }
  // 2. Le reste, une fois chaque idée
  pairs.forEach(p => { if (!uses[p.idea.id]) tryPlace(p); });
  return ctx.props.sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
}

// Prochain créneau libre aujourd'hui, avec la meilleure idée pour le remplir
function nextFreeSlotToday() {
  const iso = toISO(new Date());
  const slot = freeSlots(iso, roundTo(nowMinutes() + 15))[0];
  if (!slot) return null;
  const best = bestIdeas(iso, slot)[0];
  return best ? { iso, slot, start: best.start, idea: best.idea } : null;
}

// ---------- Repas habituels ----------

function usualFoods(meal, iso, n = 6) {
  const target = fromISO(iso);
  const wd = weekdayOf(iso);
  const acc = {};
  data.food.forEach(f => {
    if (f.meal !== meal || f.kcal == null || f.date >= iso) return;
    const days = (target - fromISO(f.date)) / 864e5;
    if (days > 45) return;
    const key = norm(f.name);
    const w = Math.exp(-days / 14) * (weekdayOf(f.date) === wd ? 1.5 : 1);
    if (!acc[key]) acc[key] = { w: 0, item: f };
    acc[key].w += w;
    if (f.date > acc[key].item.date) acc[key].item = f;
  });
  const already = new Set(data.food.filter(f => f.date === iso && f.meal === meal).map(f => norm(f.name)));
  return Object.entries(acc)
    .filter(([k, v]) => v.w >= 0.8 && !already.has(k))
    .sort((a, b) => b[1].w - a[1].w)
    .slice(0, n)
    .map(([, v]) => v.item);
}

// Dernier repas du même type, un autre jour (pour « Comme d'habitude »)
function lastMeal(meal, iso) {
  const dates = [...new Set(data.food.filter(f => f.meal === meal && f.date < iso).map(f => f.date))].sort();
  const d = dates.pop();
  return d ? data.food.filter(f => f.meal === meal && f.date === d) : [];
}
