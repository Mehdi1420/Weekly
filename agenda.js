'use strict';

// ---------- Import de l'agenda personnel (Google Agenda ou Calendrier iPhone / iCloud) ----------
// Les deux savent fournir un lien privé au format iCal (.ics). La GitHub Action « Import calendrier »
// le télécharge dans le gist secret (fichier agenda.ics) et l'app l'importe à l'ouverture.
// Les événements répétés (réunion chaque lundi…) sont développés sur les semaines à venir.

const AGENDA_FILE = 'agenda.ics';
const AGENDA_PAST_DAYS = 7;
const AGENDA_FUTURE_DAYS = 56;
const WEEKDAYS_ICS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

// Analyse complète : garde toutes les valeurs d'une propriété répétée (EXDATE…)
function parseICSFull(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = { props: {} };
    else if (line === 'END:VEVENT') { if (cur) out.push(cur); cur = null; }
    else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(';');
      (cur.props[name.toUpperCase()] ||= []).push({ val: line.slice(i + 1), params: params.join(';') });
    }
  }
  const first = (e, k) => (e.props[k] ? e.props[k][0] : null);
  return out.map(e => {
    const ds = first(e, 'DTSTART');
    const start = icsDate(ds);
    let end = icsDate(first(e, 'DTEND'));
    const dur = first(e, 'DURATION');
    if (!end && start && dur) {
      const m = dur.val.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/) || [];
      end = new Date(start.getTime() + ((+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 60000);
    }
    return {
      uid: first(e, 'UID') && first(e, 'UID').val,
      summary: icsText(first(e, 'SUMMARY') ? first(e, 'SUMMARY').val : ''),
      location: icsText(first(e, 'LOCATION') ? first(e, 'LOCATION').val : ''),
      start, end,
      allDay: /VALUE=DATE(?!-)/.test(ds ? ds.params : ''),
      rrule: first(e, 'RRULE') ? first(e, 'RRULE').val : '',
      exdates: (e.props.EXDATE || []).flatMap(x => x.val.split(',').map(v => icsDate({ val: v }))).filter(Boolean).map(toISO),
      recurrenceId: first(e, 'RECURRENCE-ID') ? icsDate(first(e, 'RECURRENCE-ID')) : null,
      cancelled: first(e, 'STATUS') && /CANCELLED/i.test(first(e, 'STATUS').val),
    };
  }).filter(e => e.uid && e.start);
}

const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const shiftDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

// Dates de début des occurrences d'un événement entre `from` et `to` (RRULE : DAILY, WEEKLY, MONTHLY, YEARLY)
function expandOccurrences(ev, from, to) {
  if (!ev.rrule) return ev.start >= from && ev.start <= to ? [ev.start] : [];
  const r = Object.fromEntries(ev.rrule.split(';').map(p => p.split('=')));
  const interval = +r.INTERVAL || 1;
  const until = r.UNTIL ? icsDate({ val: r.UNTIL }) : null;
  const count = r.COUNT ? +r.COUNT : Infinity;
  const byday = r.BYDAY ? r.BYDAY.split(',').map(d => WEEKDAYS_ICS.indexOf(d.slice(-2))) : null;
  const s0 = dayStart(ev.start);
  const startWeek = startOfWeek(ev.start);
  const matches = d => {
    const wd = (d.getDay() + 6) % 7;
    const days = Math.round((dayStart(d) - s0) / 864e5);
    if (r.FREQ === 'DAILY') return days % interval === 0;
    if (r.FREQ === 'WEEKLY') {
      const weeks = Math.round((startOfWeek(d) - startWeek) / (7 * 864e5));
      return weeks % interval === 0 && (byday ? byday.includes(wd) : wd === (ev.start.getDay() + 6) % 7);
    }
    const months = (d.getFullYear() - ev.start.getFullYear()) * 12 + d.getMonth() - ev.start.getMonth();
    if (r.FREQ === 'MONTHLY') return months % interval === 0 && d.getDate() === ev.start.getDate();
    if (r.FREQ === 'YEARLY') return months % (12 * interval) === 0 && d.getDate() === ev.start.getDate();
    return days === 0;
  };
  // Sans COUNT, inutile de parcourir les années passées : on démarre au début de la fenêtre
  let d = count === Infinity && ev.start < from ? new Date(dayStart(from).getTime()) : new Date(ev.start);
  d.setHours(ev.start.getHours(), ev.start.getMinutes(), 0, 0);
  const out = [];
  let n = 0;
  for (let i = 0; i < 4000 && d <= to && n < count && (!until || d <= until); i++, d = shiftDays(d, 1)) {
    if (!matches(d)) continue;
    n++;
    if (d >= from) out.push(new Date(d));
  }
  return out;
}

// Catégorie devinée à partir du titre
function guessCategory(title) {
  const t = lite(title);
  if (/\b(foot|muscu|sport|gym|salle|yoga|course|running|match|piscine|natation|tennis|basket|padel|velo|boxe|escalade|danse)\b/.test(t)) return 'sport';
  if (/\b(medecin|dentiste|docteur|kine|ophtalmo|rdv medical|hopital|pharmacie|psy)\b/.test(t)) return 'sante';
  if (/\b(cours|td|tp|examen|partiel|amphi|soutenance|revision|universite|fac)\b/.test(t)) return 'etudes';
  if (/\b(reunion|meeting|call|point|visio|client|bureau|travail|boulot|entretien|standup|daily|sprint|alternance)\b/.test(t)) return 'travail';
  if (/\b(anniversaire|anniv|diner|dej|dejeuner|soiree|apero|resto|restaurant|amis|famille|mariage|bar|brunch)\b/.test(t)) return 'social';
  if (/\b(courses|menage|demenagement|bricolage|plombier|livraison)\b/.test(t)) return 'maison';
  if (/\b(cinema|film|serie|concert|expo|musee|theatre|spectacle|festival|jeu|lecture)\b/.test(t)) return 'loisirs';
  return 'autre';
}

// Importe l'agenda : événements des 7 derniers jours et des 8 prochaines semaines. Renvoie le nombre d'événements.
function importAgenda(text) {
  const items = parseICSFull(text);
  if (!items.length) return 0;
  const today = new Date();
  const from = dayStart(shiftDays(today, -AGENDA_PAST_DAYS));
  const to = shiftDays(dayStart(today), AGENDA_FUTURE_DAYS);
  // Occurrences modifiées ou annulées d'un événement répété (RECURRENCE-ID)
  const overridden = {};
  items.filter(e => e.recurrenceId).forEach(e => { (overridden[e.uid] ||= new Set()).add(toISO(e.recurrenceId)); });

  const seen = new Set();
  let count = 0;
  items.forEach(ev => {
    if (ev.allDay || ev.cancelled) return;
    const dur = Math.max(15 * 60000, (ev.end || ev.start) - ev.start);
    const starts = ev.recurrenceId ? [ev.start].filter(s => s >= from && s <= to)
      : expandOccurrences(ev, from, to).filter(s => !ev.exdates.includes(toISO(s)) && !(overridden[ev.uid] && overridden[ev.uid].has(toISO(s))));
    starts.forEach(s => {
      const e = new Date(s.getTime() + dur);
      const endMin = toISO(e) === toISO(s) ? e.getHours() * 60 + e.getMinutes() : 23 * 60 + 59; // coupé à minuit
      const id = `agenda:${ev.uid}:${toISO(s)}`;
      seen.add(id);
      const fields = {
        title: ev.summary || 'Événement', date: toISO(s), notes: ev.location, category: guessCategory(ev.summary),
        start: `${pad(s.getHours())}:${pad(s.getMinutes())}`, end: fromMin(Math.max(endMin, s.getHours() * 60 + s.getMinutes() + 15)),
      };
      const existing = data.events.find(x => x.extId === id);
      if (existing) Object.assign(existing, { ...fields, category: existing.categoryEdited ? existing.category : fields.category });
      else data.events.push({ id: uid(), extId: id, source: 'agenda', done: false, ...fields });
      count++;
    });
  });
  // Ce qui a disparu de l'agenda (à venir) est retiré
  const todayISO = toISO(today);
  data.events = data.events.filter(e => !(e.extId && e.extId.startsWith('agenda:') && !seen.has(e.extId) && e.date >= todayISO && !e.done));
  return count;
}

function openAgendaHelp() {
  sheetForm.innerHTML = `
    <div class="sheet-head"><span></span><h2>Importer mon agenda</h2><button type="button" class="text-btn" data-close>OK</button></div>
    <p class="help" style="margin:0 4px 10px">Tes rendez-vous apparaissent dans ta semaine et l'app ne propose rien sur ces créneaux. Il faut un lien privé de ton agenda au format iCal.</p>
    <div class="card help-steps">
      <p><b>Google Agenda</b> (sur ordinateur) : calendar.google.com → ⚙️ <b>Paramètres</b> → clique sur ton agenda à gauche → <b>Intégrer l'agenda</b> → copie l'<b>Adresse secrète au format iCal</b>.</p>
      <p><b>Calendrier iPhone (iCloud)</b> : app Calendrier → <b>Calendriers</b> → ⓘ à côté de l'agenda → active <b>Calendrier public</b> → <b>Partager le lien</b> → copier. Remplace <b>webcal://</b> par <b>https://</b> au début. Attention : toute personne qui a ce lien peut voir cet agenda.</p>
      <p>Ensuite, dans le dépôt GitHub (Settings → Secrets and variables → Actions), crée le secret <b>AGENDA_ICS_URL</b> avec ce lien (un lien par ligne si tu as plusieurs agendas). La synchro des pas doit être activée (même gist secret, secrets <b>GIST_ID</b> et <b>GIST_TOKEN</b>).</p>
      <p>Onglet <b>Actions</b> → <b>Import calendrier</b> → <b>Run workflow</b>. Ensuite, c'est automatique toutes les 3 heures.</p>
    </div>
    <button type="button" class="secondary" id="agenda-file">Ou importer un fichier .ics</button>`;
  sheetForm.onsubmit = e => e.preventDefault();
  sheetForm.querySelector('[data-close]').onclick = () => sheet.close();
  sheetForm.querySelector('#agenda-file').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics,text/calendar';
    input.onchange = async () => {
      const n = importAgenda(await input.files[0].text());
      data.settings.agendaSyncedAt = new Date().toISOString();
      save();
      sheet.close();
      render();
      toast(n ? `${n} événements importés` : 'Aucun événement à venir dans ce fichier');
    };
    input.click();
  };
  sheet.showModal();
}
