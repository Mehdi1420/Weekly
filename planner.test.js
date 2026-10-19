'use strict';

const assert = require('node:assert/strict');
require('./planner.js');
const { planWeek, overlaps } = global.WeeklyPlanner;

const fixed = [
  { id: 'work-tue', title: 'Prof', type: 'work', date: '2026-09-08', start: '09:00', end: '16:00', load: 3 },
  { id: 'match-tue', title: 'Mini-foot', type: 'match', date: '2026-09-08', start: '20:00', end: '22:00', intensity: 'high' },
];

const result = planWeek({
  weekStart: '2026-09-07',
  fixed,
  candidates: [
    { id: 'ma2', title: 'MA2', duration: 90, priority: 5, preferredStart: '17:00' },
    { id: 'intervals', title: 'Fractionné', duration: 45, priority: 2, days: [1], conflictsWith: ['match'], intensity: 'high' },
    { id: 'aws', title: 'AWS', duration: 60, priority: 1, days: [1] },
  ],
});

assert.equal(result.placed.some(x => x.id === 'intervals'), false, 'un fractionné ne doit pas être placé le jour du match');
assert.equal(result.placed.find(x => x.id === 'ma2').date, '2026-09-07', 'la session MA2 doit éviter une journée déjà saturée');
assert.equal(result.rejected.some(x => x.id === 'intervals'), true, 'les activités impossibles doivent être expliquées');
assert.equal(overlaps({ start: '10:00', end: '11:00' }, { start: '11:10', end: '12:00' }, 15), true, 'le buffer doit être pris en compte');

const windowed = planWeek({
  weekStart: '2026-09-07',
  fixed: [],
  candidates: [{ id: 'morning-only', title: 'Session', duration: 60, priority: 5, windowsByDate: { '2026-09-07': [[18 * 60, 20 * 60]] } }],
});
assert.equal(windowed.placed[0].date, '2026-09-07', 'une activité doit respecter sa fenêtre de jour');
assert.equal(windowed.placed[0].start, '18:00', 'une activité doit commencer dans sa fenêtre');

const capacity = planWeek({
  weekStart: '2026-09-07',
  fixed: [{ title: 'Travail', type: 'work', date: '2026-09-07', start: '09:00', end: '17:00', load: 5 }],
  candidates: [{ id: 'overload', title: 'Séance', duration: 60, priority: 5, load: 2, days: [0] }],
  options: { maxDailyLoad: 6 },
});
assert.equal(capacity.placed.some(x => x.id === 'overload'), false, 'la capacité quotidienne doit être respectée');
assert.equal(capacity.rejected.some(x => x.id === 'overload'), true, 'la surcharge doit être expliquée');

console.log('planner tests: ok');
