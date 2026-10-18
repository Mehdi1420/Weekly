'use strict';

// Moteur de planification pur : aucune dépendance au DOM ni au stockage.
// Les contraintes fixes bloquent les créneaux ; les activités flexibles sont
// placées par priorité, échéance et compatibilité avec la charge du jour.
(function (root) {
  const DAY = 24 * 60;
  const pad = n => String(n).padStart(2, '0');
  const toMin = value => {
    if (typeof value === 'number') return value;
    const [h, m] = String(value || '00:00').split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const fromMin = value => `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = iso => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return isoDate(d); };
  const weekday = iso => (parseDate(iso).getDay() + 6) % 7;
  const minutes = item => Math.max(0, toMin(item.end) - toMin(item.start));

  function weekDates(weekStart) {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }

  function overlaps(a, b, buffer = 0) {
    return toMin(a.start) < toMin(b.end) + buffer && toMin(b.start) < toMin(a.end) + buffer;
  }

  function fixedForDay(fixed, date) {
    return fixed.filter(x => x.date === date).map(x => ({ ...x, start: fromMin(toMin(x.start)), end: fromMin(toMin(x.end)) }));
  }

  function score(candidate, date, fixed) {
    const deadline = candidate.deadline ? Math.max(0, Math.round((parseDate(candidate.deadline) - parseDate(date)) / 864e5)) : 99;
    const deadlineScore = deadline <= 0 ? 100 : Math.max(0, 30 - deadline);
    const load = fixed.reduce((sum, x) => sum + (x.load ?? (x.intensity === 'high' ? 3 : x.intensity === 'medium' ? 2 : 1)), 0);
    return (candidate.priority || 1) * 20 + deadlineScore - load * (candidate.recoveryCost || 0);
  }

  function conflicts(candidate, fixed) {
    const wanted = new Set((candidate.conflictsWith || []).map(value => String(value).toLowerCase()));
    return fixed.some(x => wanted.has(String(x.type || '').toLowerCase()) || wanted.has(String(x.title || '').toLowerCase()));
  }

  function canPlace(candidate, date, start, fixed, placed, options) {
    const duration = candidate.duration;
    const item = { ...candidate, date, start: fromMin(start), end: fromMin(start + duration) };
    const occupied = [...fixed, ...placed.filter(x => x.date === date)];
    if (occupied.some(x => overlaps(item, x, options.bufferMinutes))) return false;
    if (start < options.dayStart || start + duration > options.dayEnd) return false;
    const dayLoad = occupied.reduce((sum, x) => sum + (x.load ?? (x.intensity === 'high' ? 3 : x.intensity === 'medium' ? 2 : 1)), 0);
    return dayLoad + (candidate.load ?? (candidate.intensity === 'high' ? 3 : candidate.intensity === 'medium' ? 2 : 1)) <= options.maxDailyLoad;
  }

  function planWeek({ weekStart, fixed = [], candidates = [], options = {} }) {
    const cfg = { dayStart: 7 * 60, dayEnd: 23 * 60, bufferMinutes: 15, maxDailyLoad: 6, ...options };
    const dates = weekDates(weekStart);
    const placed = [];
    const rejected = [];
    const ordered = [...candidates].sort((a, b) => (b.priority || 1) - (a.priority || 1) || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')));

    for (const candidate of ordered) {
      const eligible = dates.filter(date => {
        if (candidate.days && !candidate.days.includes(weekday(date))) return false;
        if (candidate.deadline && date > candidate.deadline) return false;
        const dayFixed = fixedForDay(fixed, date);
        return !conflicts(candidate, dayFixed);
      }).sort((a, b) => score(candidate, b, fixedForDay(fixed, b)) - score(candidate, a, fixedForDay(fixed, a)));

      let chosen = null;
      for (const date of eligible) {
        const dayFixed = fixedForDay(fixed, date);
        const starts = candidate.preferredStart != null
          ? [toMin(candidate.preferredStart), cfg.dayStart]
          : [cfg.dayStart];
        for (const base of starts) {
          for (let start = base; start + candidate.duration <= cfg.dayEnd; start += 15) {
            if (canPlace(candidate, date, start, dayFixed, placed, cfg)) {
              chosen = { ...candidate, date, start: fromMin(start), end: fromMin(start + candidate.duration), planned: true };
              break;
            }
          }
          if (chosen) break;
        }
        if (chosen) break;
      }
      if (chosen) placed.push(chosen);
      else rejected.push({ id: candidate.id, title: candidate.title, reason: 'Aucun créneau compatible avec les contraintes' });
    }
    return { placed, rejected };
  }

  root.WeeklyPlanner = { addDays, fromMin, toMin, overlaps, planWeek };
}(typeof window === 'undefined' ? globalThis : window));
