'use strict';

// ---------- « Dis-le à Weekly » ----------
// L'utilisateur écrit ce qui a changé (« j'ai arrêté le foot », « je bosse le samedi maintenant »,
// « dentiste jeudi à 14h »…). L'IA (ou, sans clé, un analyseur simple) en tire une liste de
// modifications, montrées pour validation avant d'être appliquées à l'app.

const UPDATE_ACTIONS = ['add_routine', 'update_routine', 'remove_routine', 'add_event', 'add_idea', 'remove_idea', 'set_time', 'set_sport_target', 'add_goal', 'pause_project'];
const TIME_KEYS = { eveningStart: 'Libre en semaine dès', weekendStart: 'Libre le week-end dès', bedtime: 'Coucher vers' };

// Ce que l'app sait déjà, envoyé à l'IA pour qu'elle modifie au lieu de dupliquer
function updateContext() {
  const p = prefs();
  const today = new Date();
  return {
    aujourdhui: `${toISO(today)} (${['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][weekdayOf(toISO(today))]})`,
    routines: data.routines.map(r => ({ id: r.id, title: r.title, category: r.category, days: r.days, start: r.start, end: r.end })),
    idees: data.ideas.map(i => ({ id: i.id, title: i.title, category: i.category, duration: i.duration })),
    projets: data.projects.filter(x => x.active).map(x => ({ id: x.id, title: x.title })),
    horaires: { eveningStart: p.eveningStart, weekendStart: p.weekendStart, bedtime: p.bedtime },
    seancesSportParSemaine: p.sportPerWeek,
  };
}

async function updateWithAI(text, key) {
  if (!data.settings.geminiModel || data.settings.geminiKey !== key) data.settings.geminiModel = await pickGeminiModel(key);
  const body = {
    systemInstruction: { parts: [{ text:
      'Tu mets à jour une app de planning à partir de ce que l\'utilisateur écrit (un changement dans sa vie, ses horaires, ses activités). ' +
      'Tu reçois l\'état actuel (routines = activités à jours fixes, idées = activités proposées dans le temps libre, projets, horaires). ' +
      'Renvoie la liste minimale de modifications : ' +
      'add_routine (nouvelle activité régulière : title, category, days 0=lundi…6=dimanche, start, end HH:MM) ; ' +
      'update_routine (routine existante modifiée : routineId + champs changés, en reprenant les autres) ; ' +
      'remove_routine (routineId) ; ' +
      'add_event (activité ponctuelle à une date : title, category, date AAAA-MM-JJ calculée à partir d\'aujourd\'hui, start, end) ; ' +
      'add_idea (title, category, duration en minutes) ; remove_idea (ideaId) ; ' +
      'set_time (key parmi eveningStart = heure où il est libre en semaine, weekendStart = début de journée le week-end, bedtime = coucher ; value HH:MM) ; ' +
      'set_sport_target (count = séances de sport par semaine) ; ' +
      'add_goal (goal parmi aws, cert, code, language, reading, instrument ; name = langue ou certification) ; pause_project (projectId). ' +
      'Catégories : travail, etudes, sport, social, loisirs, maison, sante, autre. ' +
      'Utilise les identifiants existants quand le texte parle d\'une activité déjà connue (ne la recrée pas). ' +
      'Si une heure est vague, estime une heure plausible ; si la durée manque, estime-la. N\'invente rien d\'autre. ' +
      'Pour chaque modification, ajoute "why" : une explication très courte en français.' }] },
    contents: [{ role: 'user', parts: [{ text: `État actuel : ${JSON.stringify(updateContext())}\n\nCe que l'utilisateur écrit : ${text}` }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          changes: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
            action: { type: 'STRING', enum: UPDATE_ACTIONS },
            routineId: { type: 'STRING' }, ideaId: { type: 'STRING' }, projectId: { type: 'STRING' },
            title: { type: 'STRING' }, category: { type: 'STRING' },
            days: { type: 'ARRAY', items: { type: 'INTEGER' } },
            start: { type: 'STRING' }, end: { type: 'STRING' }, date: { type: 'STRING' },
            duration: { type: 'INTEGER' }, key: { type: 'STRING' }, value: { type: 'STRING' },
            count: { type: 'INTEGER' }, goal: { type: 'STRING' }, name: { type: 'STRING' }, why: { type: 'STRING' },
          }, required: ['action'] } },
          message: { type: 'STRING' },
        },
        required: ['changes'],
      },
    },
  };
  const res = await geminiFetch(`models/${data.settings.geminiModel}:generateContent`, key, body);
  const part = res.candidates && res.candidates[0] && res.candidates[0].content && res.candidates[0].content.parts.find(p => p.text);
  if (!part) throw new Error('réponse vide');
  return JSON.parse(part.text).changes || [];
}

// Sans IA : nouvelles activités régulières, arrêts (« j'ai arrêté le foot »), horaires simples
function updateLocal(text) {
  const changes = [];
  const sentences = String(text).split(/[.;!\n]+/).map(s => s.trim()).filter(Boolean);
  const STOP = /\b(arrete|arreter|plus de|ne fais plus|ne vais plus|supprime|annule|fini|termine|abandonne|stop)\b/;
  sentences.forEach(sentence => {
    const c = lite(sentence);
    if (STOP.test(c)) {
      const words = c.split(' ').filter(w => w.length >= 4);
      const hit = r => { const t = lite(r.title); return words.some(w => t.includes(w)) || LIFE_RULES.some(rule => rule.re.test(c) && rule.title === r.title); };
      data.routines.filter(hit).forEach(r => changes.push({ action: 'remove_routine', routineId: r.id }));
      data.ideas.filter(hit).forEach(i => changes.push({ action: 'remove_idea', ideaId: i.id }));
      return;
    }
    const libre = c.match(/\blibre\b[^.]*?\b(?:a partir de|des|vers|a)\s(\d{1,2})\s?(?:h|:)\s?(\d{2})?/);
    if (libre) changes.push({ action: 'set_time', key: /week ?end|samedi|dimanche/.test(c) ? 'weekendStart' : 'eveningStart', value: hm(libre[1], libre[2]) });
    const res = analyzeLifeLocal(sentence);
    if (res.bedtime) changes.push({ action: 'set_time', key: 'bedtime', value: res.bedtime });
    res.routines.forEach(r => {
      const same = data.routines.find(x => norm(x.title) === norm(r.title));
      changes.push(same ? { action: 'update_routine', routineId: same.id, ...r } : { action: 'add_routine', ...r });
    });
    if (res.sportPerWeek && /fois par semaine|seances?|x par semaine/.test(c)) changes.push({ action: 'set_sport_target', count: res.sportPerWeek });
  });
  return changes;
}

// Garde uniquement des modifications cohérentes et applicables ; ajoute un libellé lisible
function cleanUpdates(list) {
  const time = t => (/^\d{1,2}:\d{2}$/.test(t || '') ? hm(...t.split(':')) : '');
  const catOf = c => (CATEGORIES.some(x => x.id === c) ? c : 'autre');
  const daysOk = d => [...new Set((d || []).filter(x => Number.isInteger(x) && x >= 0 && x <= 6))].sort((a, b) => a - b);
  const out = [];
  const seen = new Set();
  const dayTxt = days => { const l = daysLabel(days); return l[0].toUpperCase() + l.slice(1); };
  (list || []).forEach(raw => {
    const x = { ...raw };
    const r = x.routineId && data.routines.find(y => y.id === x.routineId);
    let label = '';
    if (x.action === 'add_routine' || x.action === 'update_routine') {
      x.title = String(x.title || (r && r.title) || '').trim().slice(0, 60);
      x.category = catOf(x.category || (r && r.category));
      x.days = daysOk(x.days && x.days.length ? x.days : r && r.days);
      x.start = time(x.start) || (r && r.start) || '';
      x.end = time(x.end) || (r && r.end) || '';
      if (!x.title || !x.days.length || !x.start || !x.end || toMin(x.end) <= toMin(x.start)) return;
      if (x.action === 'update_routine' && !r) x.action = 'add_routine';
      if (x.action === 'update_routine' && r.title === x.title && r.days.join() === x.days.join() && r.start === x.start && r.end === x.end && r.category === x.category) return;
      label = x.action === 'add_routine'
        ? `➕ Nouvelle activité régulière : <b>${esc(x.title)}</b> · ${dayTxt(x.days)} · ${x.start}–${x.end}`
        : `✏️ <b>${esc(r.title)}</b> → ${x.title !== r.title ? `<b>${esc(x.title)}</b> · ` : ''}${dayTxt(x.days)} · ${x.start}–${x.end}`;
    } else if (x.action === 'remove_routine') {
      if (!r) return;
      label = `🗑️ Supprimer l'activité régulière <b>${esc(r.title)}</b> (${daysLabel(r.days)})`;
    } else if (x.action === 'add_event') {
      x.title = String(x.title || '').trim().slice(0, 60);
      x.category = catOf(x.category);
      x.start = time(x.start);
      x.end = time(x.end) || (x.start ? fromMin(Math.min(23 * 60 + 59, toMin(x.start) + 60)) : '');
      if (!x.title || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') || !x.start || toMin(x.end) <= toMin(x.start)) return;
      if (x.date < toISO(new Date())) return;
      label = `📅 Ajouter <b>${esc(x.title)}</b> · ${fmtShort(new Date(`${x.date}T12:00`))} · ${x.start}–${x.end}`;
    } else if (x.action === 'add_idea') {
      x.title = String(x.title || '').trim().slice(0, 60);
      x.category = catOf(x.category);
      x.duration = Math.max(10, Math.min(600, Number.isInteger(x.duration) ? x.duration : 60));
      if (!x.title || data.ideas.some(i => norm(i.title) === norm(x.title))) return;
      label = `💡 Nouvelle activité à proposer : <b>${esc(x.title)}</b> (${fmtDuration(x.duration)})`;
    } else if (x.action === 'remove_idea') {
      const i = data.ideas.find(y => y.id === x.ideaId);
      if (!i) return;
      label = `🗑️ Ne plus proposer <b>${esc(i.title)}</b>`;
    } else if (x.action === 'set_time') {
      x.value = time(x.value);
      if (!TIME_KEYS[x.key] || !x.value || prefs()[x.key] === x.value) return;
      label = `⏰ ${TIME_KEYS[x.key]} <b>${x.value}</b> (avant : ${prefs()[x.key]})`;
    } else if (x.action === 'set_sport_target') {
      if (!Number.isInteger(x.count) || x.count < 0 || x.count > 14 || x.count === prefs().sportPerWeek) return;
      label = `🏃 Objectif sport : <b>${x.count} séance${x.count > 1 ? 's' : ''}</b> par semaine`;
    } else if (x.action === 'add_goal') {
      if (!GOALS.some(g => g[0] === x.goal)) return;
      const proj = projectsFromGoals({ goals: [x.goal], certName: x.name || '', language: x.name || '' })[0];
      if (data.projects.some(p => p.active && norm(p.title) === norm(proj.title))) return;
      x.project = proj;
      label = `🎯 Nouveau projet : <b>${esc(proj.title)}</b>`;
    } else if (x.action === 'pause_project') {
      const p = data.projects.find(y => y.id === x.projectId && y.active);
      if (!p) return;
      label = `⏸️ Mettre en pause le projet <b>${esc(p.title)}</b>`;
    } else return;
    const sig = `${x.action}|${x.routineId || x.ideaId || x.projectId || x.key || ''}|${norm(x.title || '')}|${x.date || ''}`;
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push({ ...x, label, why: String(x.why || '').slice(0, 140) });
  });
  return out;
}

function applyUpdates(changes) {
  const today = toISO(new Date());
  const dropFuture = id => { data.events = data.events.filter(e => !(e.routineId === id && e.date >= today && !e.done)); };
  data.prefs = prefs();
  changes.forEach(x => {
    if (x.action === 'add_routine') {
      data.routines.push({ id: uid(), title: x.title, category: x.category, days: x.days, start: x.start, end: x.end, repeat: 'custom', notes: '', from: today, skips: [] });
    } else if (x.action === 'update_routine') {
      const r = data.routines.find(y => y.id === x.routineId);
      if (!r) return;
      Object.assign(r, { title: x.title, category: x.category, days: x.days, start: x.start, end: x.end, repeat: 'custom' });
      dropFuture(r.id); // recréées avec les nouveaux horaires
    } else if (x.action === 'remove_routine') {
      data.routines = data.routines.filter(y => y.id !== x.routineId);
      dropFuture(x.routineId);
    } else if (x.action === 'add_event') {
      data.events.push({ id: uid(), title: x.title, date: x.date, start: x.start, end: x.end, category: x.category, notes: '', done: false });
    } else if (x.action === 'add_idea') {
      data.ideas.push({ id: uid(), title: x.title, category: x.category, duration: x.duration, notes: '' });
    } else if (x.action === 'remove_idea') {
      data.ideas = data.ideas.filter(y => y.id !== x.ideaId);
    } else if (x.action === 'set_time') {
      data.prefs[x.key] = x.value;
    } else if (x.action === 'set_sport_target') {
      data.prefs.sportPerWeek = x.count;
    } else if (x.action === 'add_goal') {
      data.projects.push(x.project);
      if (!data.prefs.goals.includes(x.goal)) data.prefs.goals = [...data.prefs.goals, x.goal];
    } else if (x.action === 'pause_project') {
      const p = data.projects.find(y => y.id === x.projectId);
      if (p) p.active = false;
    }
  });
  state.proposals = [];
}

// Feuille : texte → modifications proposées → validation
function openUpdateSheet(prefill = '') {
  const hasKey = !!data.settings.geminiKey;
  sheetForm.innerHTML = `
    <div class="sheet-head"><button type="button" class="text-btn" data-close>Fermer</button><h2>Dis-le à Weekly</h2><span></span></div>
    <p class="help" style="margin:0 4px 10px">Écris ce qui a changé, comme à un ami. L'app te montre ce qu'elle a compris avant de modifier quoi que ce soit.</p>
    <div class="field"><label><textarea name="txt" rows="4" placeholder="Ex : J'ai arrêté le foot. Je travaille maintenant le samedi de 10h à 18h. Dentiste jeudi à 14h. Je me couche plutôt vers minuit.">${esc(prefill)}</textarea></label></div>
    ${hasKey ? '' : `<p class="help" style="margin:-2px 4px 10px">Sans clé Gemini, seules les phrases simples sont comprises. ${geminiKeyLink('Obtenir une clé')}</p>`}
    <button type="submit" class="primary">✨ Analyser</button>
    <div id="upd-result"></div>`;
  sheetForm.querySelector('[data-close]').onclick = () => sheet.close();
  const box = sheetForm.querySelector('#upd-result');
  let changes = [];
  sheetForm.onsubmit = async e => {
    e.preventDefault();
    const txt = sheetForm.txt.value.trim();
    if (!txt) { toast('Écris d\'abord ce qui a changé'); return; }
    const btn = sheetForm.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Analyse en cours…';
    let raw;
    let by = 'local';
    if (hasKey && navigator.onLine) {
      try { raw = await updateWithAI(txt, data.settings.geminiKey); by = 'ia'; } catch (err) { toast(`IA indisponible (${err.message}) : analyse simplifiée`); }
    }
    if (!raw) raw = updateLocal(txt);
    changes = cleanUpdates(raw);
    btn.disabled = false;
    btn.textContent = '✨ Analyser à nouveau';
    if (!changes.length) {
      box.innerHTML = `<div class="card upd-empty">Je n'ai rien trouvé à modifier. ${by === 'local' ? 'Essaie avec le jour et l\'heure (« le mardi à 19h »), ou ajoute une clé Gemini pour que tout soit compris.' : 'Précise le jour, l\'heure ou le nom de l\'activité.'}</div>`;
      return;
    }
    box.innerHTML = `
      <div class="section-title">Ce que j'ai compris</div>
      <div class="field upd-list">${changes.map((c, i) => `
        <label><span><span>${c.label}</span>${c.why ? `<small>${esc(c.why)}</small>` : ''}</span><input type="checkbox" data-upd="${i}" checked></label>`).join('')}
      </div>
      <button type="button" class="primary" data-upd-apply>Appliquer</button>`;
    slideIn(box, 1);
    box.querySelector('[data-upd-apply]').onclick = () => {
      const keep = changes.filter((_, i) => box.querySelector(`[data-upd="${i}"]`).checked);
      if (!keep.length) { toast('Rien de coché'); return; }
      applyUpdates(keep);
      // Le texte de présentation garde la trace des changements (l'IA s'en sert ensuite)
      const p = prefs();
      data.prefs = { ...p, lifeText: `${p.lifeText ? `${p.lifeText}\n` : ''}[${fmtShort(new Date())}] ${txt}`.slice(-4000) };
      save();
      sheet.close();
      state.tab = 'week';
      render();
      toast(`${keep.length} modification${keep.length > 1 ? 's' : ''} appliquée${keep.length > 1 ? 's' : ''} ✓`);
    };
  };
  sheet.showModal();
  setTimeout(() => sheetForm.txt.focus(), 300);
}
