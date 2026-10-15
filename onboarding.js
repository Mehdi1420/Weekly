'use strict';

// ---------- Questionnaire de bienvenue ----------
// Au premier lancement, l'app pose quelques questions pour se configurer :
// modules utiles, rythme de vie, sports, centres d'intérêt, objectifs, profil santé.
// Ensuite elle apprend toute seule. Le questionnaire peut être refait depuis les Réglages.

// Catalogue des activités proposables : [id, libellé, catégorie, durée en minutes]
const SPORTS = [
  ['course', 'Course à pied', 45], ['muscu', 'Musculation', 60], ['foot', 'Football', 90], ['basket', 'Basket', 90],
  ['tennis', 'Tennis', 60], ['padel', 'Padel', 90], ['natation', 'Natation', 45], ['velo', 'Vélo', 60],
  ['yoga', 'Yoga', 30], ['escalade', 'Escalade', 90], ['boxe', 'Boxe / arts martiaux', 60], ['danse', 'Danse', 60],
  ['rando', 'Randonnée', 180], ['marche', 'Marche', 45],
];
const INTERESTS = [
  ['cinema', 'Cinéma', 'loisirs', 150, '20:30'], ['series', 'Film ou série à la maison', 'loisirs', 90, '21:00'],
  ['jeux', 'Jeux vidéo', 'loisirs', 90], ['societe', 'Jeux de société', 'social', 120],
  ['musique', 'Jouer de la musique', 'loisirs', 45], ['concert', 'Concert', 'loisirs', 180, '20:00'],
  ['expo', 'Musée ou expo', 'loisirs', 120], ['cuisine', 'Cuisiner une nouvelle recette', 'maison', 60],
  ['photo', 'Sortie photo', 'loisirs', 90], ['dessin', 'Dessin', 60, 'loisirs'],
  ['amis', 'Dîner entre amis', 'social', 120, '20:00'], ['sortie', 'Sortie entre amis', 'social', 150, '20:30'],
  ['famille', 'Appeler la famille', 'social', 30, '19:00'], ['visite', 'Voir la famille', 'social', 180, '12:00'],
  ['meditation', 'Méditation', 'sante', 15], ['balade', 'Balade', 'sante', 45],
  ['benevolat', 'Bénévolat', 'social', 120], ['jardin', 'Jardinage', 'maison', 60],
].map(([id, label, a, b, at]) => (typeof a === 'number' ? [id, label, b, a, at] : [id, label, a, b, at]));
// (le 5e champ, facultatif, est l'heure naturelle de l'activité)
const GOALS = [
  ['cert', '🎓 Certification ou diplôme'], ['code', '💻 Programmation'],
  ['language', '🗣️ Langue étrangère'], ['reading', '📖 Lecture'], ['instrument', '🎸 Instrument'], ['custom', '🎯 Autre projet'],
];
const BOOK_THEMES = [
  ['roman', 'Romans'], ['sf', 'Science-fiction'], ['productivite', 'Développement perso'], ['science', 'Science et histoire'],
  ['prog', 'Programmation'], ['cloud', 'Cloud / tech'],
];
const ALWAYS_IDEAS = [['Courses de la semaine', 'maison', 60], ['Ménage', 'maison', 60]];

const defaultPrefs = () => ({
  name: '', situation: '', modules: { goals: true, forme: true },
  eveningStart: '18:00', bedtime: '23:00', weekendStart: '10:00',
  sports: [], otherSport: '', sportPerWeek: 2, interests: [], otherInterest: '',
  goals: [], language: '', certName: '', bookThemes: [], otherBookThemes: '', customGoal: '',
});
const prefs = () => ({ ...defaultPrefs(), ...(data.prefs || {}) });

// ---------- Plages horaires personnelles (utilisées par le planificateur) ----------

function prefMinutes(key, fallback) {
  const v = toMin(prefs()[key] || fallback);
  return key === 'bedtime' && v < 12 * 60 ? 23 * 60 + 59 : v; // coucher après minuit
}
function leisureWindow(iso) {
  const end = prefMinutes('bedtime', '23:00');
  return weekdayOf(iso) >= 5 ? [prefMinutes('weekendStart', '10:00'), end] : [prefMinutes('eveningStart', '18:00'), end];
}
function workWindow(iso) {
  const end = prefMinutes('bedtime', '23:00');
  return weekdayOf(iso) >= 5
    ? [prefMinutes('weekendStart', '10:00'), Math.min(20 * 60, end - 60)]
    : [prefMinutes('eveningStart', '18:00'), end - 30];
}
const readingWindow = () => { const end = prefMinutes('bedtime', '23:00'); return [end - 150, end]; };

// ---------- Écran ----------

const OB_STEPS = ['welcome', 'modules', 'life', 'rhythm', 'sports', 'interests', 'goals', 'health', 'review', 'done'];
let ob = null; // état du questionnaire en cours

function startOnboarding(stepName) {
  ob = {
    step: 0, p: prefs(), profile: { ...data.profile }, weight: latestWeight() || '', geminiKey: data.settings.geminiKey || '',
    lifeText: (data.prefs && data.prefs.lifeText) || '', analyzedText: null, routines: [],
    analysis: null, touched: new Set(), extras: null, extrasSig: '', more: {},
  };
  let el = document.getElementById('onboarding');
  if (!el) {
    el = document.createElement('div');
    el.id = 'onboarding';
    document.body.appendChild(el);
    el.addEventListener('click', onboardingClick);
    // Ce que l'utilisateur modifie lui-même n'est plus écrasé par l'analyse en arrière-plan
    el.addEventListener('input', e => {
      const k = e.target.dataset.ob || (e.target.dataset.obMod && 'modules');
      if (k && ob) ob.touched.add(k);
    });
    el.classList.add('screen-in');
  }
  document.body.classList.add('ob-open');
  if (stepName) ob.step = Math.max(0, obVisibleSteps().indexOf(stepName));
  renderOnboarding();
}

function obVisibleSteps() {
  return OB_STEPS.filter(s => (s !== 'goals' || ob.p.modules.goals) && (s !== 'health' || ob.p.modules.forme) && (s !== 'review' || !!ob.analysis || !!ob.extras));
}

// Peu de choix affichés au départ (les plus courants + ceux déjà cochés) ; le reste sur demande
const FEW = 6;
function shortList(group, list, selected) {
  // Les choix libres (suggérés ou déjà cochés) s'ajoutent au catalogue, les suggestions passent devant
  const extra = [...new Set([...selected, ...suggestedOf(group)])].filter(id => id.startsWith('free:')).map(id => [id, freeLabel(id)]);
  const sug = suggestedOf(group);
  list = [...extra, ...list].sort((a, b) => sug.includes(b[0]) - sug.includes(a[0]));
  const shown = ob.more[group] ? list : list.filter(([id], i) => i < FEW || selected.includes(id) || sug.includes(id));
  const more = !ob.more[group] && shown.length < list.length
    ? `<button type="button" class="chip more-chip" data-ob-more="${group}">＋ ${list.length - shown.length} autres idées</button>` : '';
  return shown.map(([id, l]) => chip(group, id, l, selected.includes(id))).join('') + more;
}

const chip = (group, id, label, on) => {
  const sug = !on && ob && ob.suggested && (ob.suggested[group] || []).includes(id);
  return `<button type="button" class="chip selectable ${on ? 'active' : ''} ${sug ? 'suggested' : ''}" data-ob-chip="${group}" data-id="${esc(id)}">${sug ? '✨ ' : ''}${esc(label)}</button>`;
};
// Choix suggérés par l'analyse du texte (affichés en premier, à toucher pour les ajouter)
const suggestedOf = group => (ob && ob.suggested && ob.suggested[group]) || [];
const freeLabel = id => id.slice(5);
const sugHint = group => (suggestedOf(group).length ? '<p class="help" style="margin:-6px 4px 12px">✨ Suggéré d\'après ce que tu as écrit : touche pour l\'ajouter.</p>' : '');

function renderOnboarding(dir = 0) {
  const steps = obVisibleSteps();
  const name = steps[ob.step];
  const p = ob.p;
  const first = p.name ? `, ${esc(p.name)}` : '';
  let body = '';
  if (name === 'welcome') {
    body = `
      <div class="ob-hero">👋</div>
      <h1>Bienvenue dans Weekly</h1>
      <p class="ob-lead">Quelques questions pour adapter l'app à toi. Ensuite, elle apprend de tes habitudes et s'ajuste toute seule.</p>
      <div class="field"><label>Ton prénom <input type="text" data-ob="name" value="${esc(p.name)}" placeholder="Facultatif" autocomplete="given-name"></label></div>`;
  } else if (name === 'modules') {
    body = `
      <h1>Qu'est-ce que l'app doit gérer${first} ?</h1>
      <p class="ob-lead">Tu pourras changer d'avis plus tard dans les Réglages.</p>
      <div class="field">
        <label><span><b>📅 Planning et activités</b><br><small>Ta semaine, tes routines, des idées d'activités</small></span><input type="checkbox" checked disabled></label>
        <label><span><b>🎯 Études et projets perso</b><br><small>Devoirs, cours Moodle, certifications, lecture…</small></span><input type="checkbox" data-ob-mod="goals" ${p.modules.goals ? 'checked' : ''}></label>
        <label><span><b>❤️ Forme</b><br><small>Calories, pas, poids</small></span><input type="checkbox" data-ob-mod="forme" ${p.modules.forme ? 'checked' : ''}></label>
      </div>`;
  } else if (name === 'life') {
    body = `
      <h1>Ta semaine en quelques mots</h1>
      <p class="ob-lead">Décris ce que tu fais en ce moment, comme tu le dirais à un ami : travail, cours, horaires, sport, petites habitudes… L'app planifiera autour.</p>
      <div class="field"><label><textarea data-ob-life rows="7" placeholder="Ex : Je travaille en alternance du lundi au mercredi de 9h à 17h30 et j'ai cours le jeudi et le vendredi. Foot le mardi soir vers 20h, muscu 2 fois par semaine. Je lis un peu avant de dormir et je prépare la certification AWS.">${esc(ob.lifeText)}</textarea></label></div>
      ${data.settings.geminiKey ? '<p class="help">🤖 Ton texte sera analysé par l\'IA (Gemini).</p>' : `
      <p class="help" style="margin-bottom:8px">Sans clé, l'app comprend les formulations simples. Avec une clé Gemini gratuite (${geminiKeyLink('la créer ici')}), l'IA comprend tout ton texte et calcule aussi les calories de tes repas automatiquement.</p>
      <div class="field"><label>Clé Gemini <input type="password" data-ob-key value="${esc(ob.geminiKey || '')}" placeholder="AIza… (facultatif)" autocomplete="off"></label></div>
      ${geminiKeyButton()}`}`;
  } else if (name === 'rhythm') {
    body = `
      <h1>Ton rythme</h1>
      <p class="ob-lead">L'app ne te proposera des activités (sport, lecture, projets…) que pendant ton temps libre. Indique quand il commence et quand il se termine.</p>
      <div class="field rhythm">
        <label><span>Libre en semaine dès<small>Fin de tes cours ou de ton travail</small></span><input type="time" data-ob="eveningStart" value="${p.eveningStart}"></label>
        <label><span>Libre le week-end dès<small>L'heure où ta journée commence vraiment</small></span><input type="time" data-ob="weekendStart" value="${p.weekendStart}"></label>
        <label><span>Je me couche vers<small>Rien ne sera proposé après</small></span><input type="time" data-ob="bedtime" value="${p.bedtime}"></label>
      </div>`;
  } else if (name === 'sports') {
    body = `
      <h1>Tes sports</h1>
      <p class="ob-lead">Ceux que tu pratiques ou que tu aimerais pratiquer. Coche ou écris-les avec tes mots.</p>
      <div class="chips">${shortList('sports', SPORTS, p.sports)}</div>${sugHint('sports')}
      <div class="field"><label class="free"><span>Avec tes mots</span><textarea data-ob="otherSport" rows="2" placeholder="Ex : surf l'été, foot en salle avec les collègues, je veux reprendre la course…">${esc(p.otherSport)}</textarea></label></div>
      <div class="field">
        <label>Séances par semaine visées
          <span class="stepper"><button type="button" data-ob-step="-1">−</button><b>${p.sportPerWeek}</b><button type="button" data-ob-step="1">+</button></span></label>
      </div>`;
  } else if (name === 'interests') {
    body = `
      <h1>Tes centres d'intérêt</h1>
      <p class="ob-lead">L'app s'en sert pour te proposer des idées qui te ressemblent. Coche ou écris-les avec tes mots.</p>
      <div class="chips">${shortList('interests', INTERESTS, p.interests)}</div>${sugHint('interests')}
      <div class="field"><label class="free"><span>Avec tes mots</span><textarea data-ob="otherInterest" rows="3" placeholder="Ex : théâtre, pêche le week-end, soirées jeux avec les potes, j'aimerais me mettre à la peinture…">${esc(p.otherInterest)}</textarea></label></div>`;
  } else if (name === 'goals') {
    body = `
      <h1>Tes objectifs perso</h1>
      <p class="ob-lead">L'app crée un projet pour chacun et planifie des sessions dans ta semaine.</p>
      <div class="chips">${GOALS.map(([id, l]) => chip('goals', id, l, p.goals.includes(id))).join('')}</div>${sugHint('goals')}
      ${p.goals.includes('cert') ? `<div class="field"><label>Laquelle ? <input type="text" data-ob="certName" value="${esc(p.certName)}" placeholder="Ex : AWS, permis, TOEIC…"></label></div>` : ''}
      ${p.goals.includes('language') ? `<div class="field"><label>Quelle langue ? <input type="text" data-ob="language" value="${esc(p.language)}" placeholder="Ex : anglais"></label></div>` : ''}
      ${p.goals.includes('reading') ? `<p class="ob-lead" style="margin-top:14px">Ce que tu aimes lire :</p><div class="chips">${BOOK_THEMES.map(([id, l]) => chip('bookThemes', id, l, p.bookThemes.includes(id))).join('')}</div>
      <div class="field"><label>Autres genres <input type="text" data-ob="otherBookThemes" value="${esc(p.otherBookThemes || '')}" placeholder="Ex : polar, fantasy, manga, biographies…"></label></div>` : ''}
      <div class="field"><label class="free"><span>Autre chose en tête ?</span><textarea data-ob="customGoal" rows="2" placeholder="Ex : apprendre le montage vidéo, passer le permis, lancer un side project…">${esc(p.customGoal || '')}</textarea></label></div>
      <p class="help">🎓 Tu as des cours ? Tu pourras connecter Moodle dans l'onglet Objectifs pour importer cours et devoirs.</p>`;
  } else if (name === 'health') {
    const pr = ob.profile;
    body = `
      <h1>Ton profil santé</h1>
      <p class="ob-lead">Pour calculer tes besoins caloriques. Visible de toi seul.</p>
      <div class="field">
        <label>Sexe <select data-obp="sex"><option value="">–</option><option value="h" ${pr.sex === 'h' ? 'selected' : ''}>Homme</option><option value="f" ${pr.sex === 'f' ? 'selected' : ''}>Femme</option></select></label>
        <label>Date de naissance <input type="date" data-obp="birth" min="1900-01-01" max="${toISO(new Date())}" value="${pr.birth || ''}"></label>
        <label>Taille (cm) <input type="number" data-obp="height" inputmode="numeric" value="${pr.height || ''}"></label>
        <label>Poids (kg) <input type="number" data-ob-weight step="0.1" inputmode="decimal" value="${ob.weight}"></label>
        <label>Objectif <select data-obp="goal">
          <option value="perdre" ${pr.goal === 'perdre' ? 'selected' : ''}>Perdre du poids</option>
          <option value="maintenir" ${!pr.goal || pr.goal === 'maintenir' ? 'selected' : ''}>Maintenir</option>
          <option value="prendre" ${pr.goal === 'prendre' ? 'selected' : ''}>Prendre du poids</option></select></label>
      </div>
      ${data.settings.geminiKey || ob.geminiKey ? '' : `
      <h2 class="ob-sub">Calcul des calories par l'IA</h2>
      <p class="ob-lead">Tu tapes ton repas comme tu parles, l'IA calcule les calories automatiquement. Gratuit avec une clé Google Gemini : ${geminiKeyLink()} → <b>Create API key</b>. Facultatif, modifiable dans les Réglages.</p>
      <div class="field"><label>Clé Gemini <input type="password" data-ob-key value="" placeholder="AIza… (facultatif)" autocomplete="off"></label></div>
      ${geminiKeyButton()}`}`;
  } else if (name === 'review') {
    const kept = ob.routines;
    const a = ob.analysis || { status: 'done' };
    const x = ob.extras && ob.extras.status === 'done' ? ob.extras.res : null;
    body = a.status === 'pending' || (ob.extras && ob.extras.status === 'pending') ? `
      <div class="ob-hero ob-thinking">🤖</div>
      <h1>Encore quelques secondes…</h1>
      <p class="ob-lead">Gemini termine l'analyse de ce que tu as écrit pour bien comprendre ta semaine et tes envies. Cette page se met à jour toute seule.</p>
      <div class="ob-progress"><span></span></div>` : `
      <h1>Ce que j'ai compris</h1>
      ${kept.length ? `
      <p class="ob-lead">Ces activités reviendront chaque semaine dans ton planning. Décoche ce qui ne va pas (tu pourras tout modifier ensuite).</p>
      <div class="field">${kept.map((r, i) => `
        <label><span>${cat(r.category).icon} <b>${esc(r.title)}</b><br>
          <small>${daysLabel(r.days)[0].toUpperCase() + daysLabel(r.days).slice(1)} · ${r.start}–${r.end}</small></span>
          <input type="checkbox" data-ob-routine="${i}" ${r.keep ? 'checked' : ''}></label>`).join('')}
      </div>` : ob.analysis ? '<p class="ob-lead">Je n\'ai pas repéré d\'activité à jour et heure fixes dans ton texte. Tu pourras en ajouter depuis ta semaine, ou avec « Dis-le à Weekly ».</p>' : ''}
      ${x && (x.ideas.length || x.projects.length) ? `
      <h2 class="ob-sub">D'après tes mots</h2>
      <p class="ob-lead">Ce que j'ai tiré de ce que tu as écrit. Décoche ce qui ne va pas.</p>
      <div class="field">${x.ideas.map((it, i) => `
        <label><span>${cat(it.category).icon} <b>${esc(it.title)}</b><br><small>Idée d'activité · ${fmtDuration(it.duration)}${it.at ? ` · vers ${it.at}` : ''}</small></span>
          <input type="checkbox" data-ob-xidea="${i}" ${it.keep ? 'checked' : ''}></label>`).join('')}${x.projects.map((pr, i) => `
        <label><span>${esc(pr.icon || '🎯')} <b>${esc(pr.title)}</b><br><small>Projet · ${fmtDuration(pr.weeklyMinutes)} par semaine</small></span>
          <input type="checkbox" data-ob-xproj="${i}" ${pr.keep ? 'checked' : ''}></label>`).join('')}
      </div>` : ''}
      ${(a.res && a.res.error) || (x && x.error) ? `<p class="help">IA indisponible (${esc((a.res && a.res.error) || x.error)}) : analyse simplifiée.</p>` : ''}`;
  } else {
    const n = buildIdeas(p).length;
    body = `
      <div class="ob-hero">✨</div>
      <h1>C'est prêt${first} !</h1>
      <ul class="ob-recap">
        ${ob.routines.filter(r => r.keep).length ? `<li>${ob.routines.filter(r => r.keep).length} activités régulières ajoutées à ton planning</li>` : ''}
        <li>${n} idées d'activités adaptées à tes goûts</li>
        ${p.modules.goals && p.goals.length ? `<li>${p.goals.length} projet${p.goals.length > 1 ? 's' : ''} créé${p.goals.length > 1 ? 's' : ''} dans Objectifs</li>` : ''}
        <li>Activités proposées de ${p.eveningStart} à ${p.bedtime} en semaine, et de ${p.weekendStart} à ${p.bedtime} le week-end</li>
        ${p.sports.length || p.otherSport ? `<li>Objectif : ${p.sportPerWeek} séance${p.sportPerWeek > 1 ? 's' : ''} de sport par semaine</li>` : ''}
      </ul>
      <p class="ob-lead">Note tes activités au fil des jours : l'app repère tes routines, ajuste ses propositions et retient ce que tu refuses.</p>`;
  }
  const last = ob.step === steps.length - 1;
  const el = document.getElementById('onboarding');
  const pending = (ob.analysis && ob.analysis.status === 'pending') || (ob.extras && ob.extras.status === 'pending');
  const waiting = name === 'review' && pending;
  const nav = `
        ${ob.step > 0 ? '<button type="button" class="secondary" data-ob-nav="back">Retour</button>' : (data.settings.onboarded ? '<button type="button" class="secondary" data-ob-nav="close">Annuler</button>' : '')}
        <button type="button" class="primary" data-ob-nav="${last ? 'finish' : 'next'}" ${waiting ? 'disabled' : ''}>${last ? 'C\'est parti' : waiting ? 'Analyse en cours…' : 'Continuer'}</button>`;
  const dots = el.querySelectorAll('.ob-dots span');
  const badge = pending && name !== 'review'
    ? '<div class="ob-ai-badge">🤖 Gemini analyse tes réponses en arrière-plan…</div>' : '';
  if (dots.length === steps.length) {
    el.querySelector('.ob-badge').innerHTML = badge;
    // Mise à jour sur place : la barre de progression avance en douceur et seul le contenu change
    dots.forEach((d, i) => d.classList.toggle('on', i <= ob.step));
    el.querySelector('.ob-body').innerHTML = body;
    el.querySelector('.ob-nav').innerHTML = nav;
  } else {
    el.innerHTML = `
    <div class="ob-inner">
      <div class="ob-dots">${steps.map((_, i) => `<span class="${i <= ob.step ? 'on' : ''}"></span>`).join('')}</div>
      <div class="ob-badge">${badge}</div>
      <div class="ob-body">${body}</div>
      <div class="ob-nav">${nav}</div>
    </div>`;
  }
  if (dir) {
    el.scrollTop = 0;
    slideIn(el.querySelector('.ob-body'), dir);
  }
}

// Glissement d'une page à l'autre (même mouvement que les onglets)
function slideIn(node, dir) {
  if (!node) return;
  node.classList.remove('tab-in-r', 'tab-in-l');
  void node.offsetWidth;
  node.classList.add(dir > 0 ? 'tab-in-r' : 'tab-in-l');
}

// Fondu de sortie d'un écran plein (connexion, questionnaire) avant de le retirer
function fadeOutRemove(el, done) {
  if (!el) { if (done) done(); return; }
  el.classList.add('screen-out');
  let finished = false;
  const end = () => { if (finished) return; finished = true; el.remove(); if (done) done(); };
  el.addEventListener('animationend', e => { if (e.target === el) end(); }); // ignorer les animations des enfants
  setTimeout(end, 500);
}

// Lit les champs de l'étape affichée avant de changer d'étape
function readOnboardingFields() {
  const el = document.getElementById('onboarding');
  el.querySelectorAll('[data-ob]').forEach(i => { ob.p[i.dataset.ob] = i.value.trim(); });
  el.querySelectorAll('[data-ob-mod]').forEach(i => { ob.p.modules[i.dataset.obMod] = i.checked; });
  el.querySelectorAll('[data-obp]').forEach(i => { ob.profile[i.dataset.obp] = i.type === 'number' ? +i.value || '' : i.value; });
  const k = el.querySelector('[data-ob-key]');
  if (k) ob.geminiKey = k.value.trim();
  const life = el.querySelector('[data-ob-life]');
  if (life) ob.lifeText = life.value.trim();
  el.querySelectorAll('[data-ob-routine]').forEach(i => { ob.routines[+i.dataset.obRoutine].keep = i.checked; });
  el.querySelectorAll('[data-ob-xidea]').forEach(i => { ob.extras.res.ideas[+i.dataset.obXidea].keep = i.checked; });
  el.querySelectorAll('[data-ob-xproj]').forEach(i => { ob.extras.res.projects[+i.dataset.obXproj].keep = i.checked; });
  const w = el.querySelector('[data-ob-weight]');
  if (w) ob.weight = parseFloat(String(w.value).replace(',', '.')) || '';
}

function onboardingClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  readOnboardingFields();
  if (t.dataset.obMore) {
    ob.more[t.dataset.obMore] = true;
    renderOnboarding();
  } else if (t.dataset.obChip) {
    const g = t.dataset.obChip;
    const id = t.dataset.id;
    if (g === 'situation') ob.p.situation = ob.p.situation === id ? '' : id;
    else ob.p[g] = ob.p[g].includes(id) ? ob.p[g].filter(x => x !== id) : [...ob.p[g], id];
    renderOnboarding();
  } else if (t.dataset.obStep) {
    ob.p.sportPerWeek = Math.max(0, Math.min(14, ob.p.sportPerWeek + +t.dataset.obStep));
    ob.touched.add('sportPerWeek');
    renderOnboarding();
  } else if (t.dataset.obNav === 'next') {
    if (obVisibleSteps()[ob.step] === 'life' && ob.lifeText && ob.lifeText !== ob.analyzedText) startLifeAnalysis();
    if (['sports', 'interests', 'goals'].includes(obVisibleSteps()[ob.step])) startExtrasAnalysis();
    ob.step++;
    renderOnboarding(1);
  }
  else if (t.dataset.obNav === 'back') { ob.step--; renderOnboarding(-1); }
  else if (t.dataset.obNav === 'close') closeOnboarding();
  else if (t.dataset.obNav === 'finish') finishOnboarding();
}

// Analyse du texte libre en arrière-plan : l'IA prend le temps de réfléchir pendant que
// l'utilisateur continue le questionnaire ; le résultat complète les étapes suivantes.
function startLifeAnalysis() {
  const text = ob.lifeText;
  const key = ob.geminiKey || data.settings.geminiKey;
  const run = {};
  ob.analyzedText = text;
  ob.analysis = run;
  run.status = 'pending';
  analyzeLife(text, key, { deep: true }).then(res => {
    if (!ob || ob.analysis !== run) return; // questionnaire fermé ou texte réanalysé entre-temps
    readOnboardingFields();
    // Clé validée par l'analyse : on l'enregistre tout de suite (elle sert aussi aux calories)
    if (res.by === 'ia' && ob.geminiKey && ob.geminiKey !== data.settings.geminiKey) {
      Object.assign(data.settings, { geminiKey: ob.geminiKey, aiMode: 'gemini' });
      save();
    }
    applyLifeToOnboarding(res);
    run.status = 'done';
    run.res = res;
    const name = obVisibleSteps()[ob.step];
    const el = document.getElementById('onboarding');
    const typing = el && el.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    // En pleine saisie : on ne redessine pas sous les doigts, l'étape suivante affichera le résultat
    if (typing && name !== 'review') el.querySelector('.ob-badge').innerHTML = '';
    else renderOnboarding(name === 'review' ? 1 : 0);
    if (name !== 'review') toast(res.routines.length ? `🤖 Analyse terminée : ${res.routines.length} activité${res.routines.length > 1 ? 's' : ''} régulière${res.routines.length > 1 ? 's' : ''} repérée${res.routines.length > 1 ? 's' : ''}` : '🤖 Analyse terminée');
  });
}

function closeOnboarding() {
  const el = document.getElementById('onboarding');
  if (el) el.removeAttribute('id'); // un nouveau questionnaire peut s'ouvrir pendant le fondu
  document.body.classList.remove('ob-open');
  ob = null;
  fadeOutRemove(el);
}

// ---------- Application des réponses ----------

function buildIdeas(p) {
  const out = [];
  SPORTS.filter(([id]) => p.sports.includes(id)).forEach(([, title, duration]) => out.push({ title, category: 'sport', duration }));
  p.sports.filter(id => id.startsWith('free:')).forEach(id => out.push({ title: freeLabel(id), category: 'sport', duration: 60 }));
  INTERESTS.filter(([id]) => p.interests.includes(id)).forEach(([, title, category, duration, at]) => out.push({ title, category, duration, ...(at ? { at } : {}) }));
  p.interests.filter(id => id.startsWith('free:')).forEach(id => out.push({ title: freeLabel(id), category: 'loisirs', duration: 90 }));
  ALWAYS_IDEAS.forEach(([title, category, duration]) => out.push({ title, category, duration }));
  // Ce que l'utilisateur a écrit avec ses mots, interprété par l'analyse (et validé au récapitulatif)
  extrasResult(p).ideas.filter(i => i.keep).forEach(({ title, category, duration, at }) => out.push({ title, category, duration, ...(at ? { at } : {}) }));
  return out;
}

function projectsFromGoals(p) {
  const out = [];
  if (p === ob?.p) extrasResult(p).projects.filter(x => x.keep).forEach(x => out.push({ ...newProject('custom'), title: x.title, icon: x.icon || '🎯', category: x.category, weeklyMinutes: x.weeklyMinutes, session: x.session }));
  p.goals.forEach(g => {
    // Certification AWS : programme détaillé ; autre certification : projet générique à son nom
    if (g === 'aws' || (g === 'cert' && /\b(aws|amazon)\b/i.test(p.certName || ''))) out.push(newProject('aws'));
    else if (g === 'code') out.push(newProject('code'));
    else if (g === 'reading') out.push(newProject('reading'));
    else if (g === 'cert') out.push({ ...newProject('custom'), title: `Certification ${p.certName || ''}`.trim(), icon: '🎓', type: 'cert', category: 'etudes', weeklyMinutes: 150 });
    else if (g === 'language') out.push({ ...newProject('custom'), title: `Apprendre ${p.language ? `l'${p.language}`.replace(/^l'([^aeiouyh])/i, 'le $1') : 'une langue'}`, icon: '🗣️', type: 'learning', category: 'etudes', weeklyMinutes: 105, session: 30 });
    else if (g === 'instrument') out.push({ ...newProject('custom'), title: 'Jouer d\'un instrument', icon: '🎸', category: 'loisirs', weeklyMinutes: 120, session: 30 });
    else if (!extrasResult(p).projects.length) out.push({ ...newProject('custom'), title: 'Mon projet' });
  });
  return out;
}

function finishOnboarding() {
  readOnboardingFields();
  const p = ob.p;
  const wasOnboarded = data.settings.onboarded;
  p.lifeText = ob.lifeText;
  data.prefs = p;
  data.settings.name = p.name;

  // Idées : remplacées si personne n'y a touché, sinon complétées
  const untouched = data.ideas.length === DEFAULT_IDEAS.length && data.ideas.every(i => DEFAULT_IDEAS.some(d => d.title === i.title && d.duration === i.duration && d.category === i.category));
  const fresh = buildIdeas(p);
  if (untouched) data.ideas = [];
  const have = new Set(data.ideas.map(i => norm(i.title)));
  fresh.forEach(i => { if (!have.has(norm(i.title))) data.ideas.push({ id: uid(), notes: '', ...i }); });

  // Projets : un par objectif choisi, sans doublon
  if (p.modules.goals) {
    const titles = new Set(data.projects.map(x => norm(x.title)));
    projectsFromGoals(p).forEach(x => { if (!titles.has(norm(x.title))) data.projects.push(x); });
  }

  // Activités régulières comprises dans le texte : deviennent des routines (mises à jour si elles existent déjà)
  const today = toISO(new Date());
  ob.routines.filter(r => r.keep).forEach(r => {
    const same = data.routines.find(x => norm(x.title) === norm(r.title) && x.days.join() === r.days.join());
    const fields = { title: r.title, category: r.category, start: r.start, end: r.end, days: r.days, repeat: 'custom' };
    if (same) {
      Object.assign(same, fields);
      data.events = data.events.filter(e => !(e.routineId === same.id && e.date >= today && !e.done)); // recréées avec les nouveaux horaires
    } else {
      data.routines.push({ id: uid(), ...fields, notes: '', from: today, skips: [] });
    }
  });
  // La lecture du soir compte pour le projet Lecture
  const rp = data.projects.find(x => x.type === 'reading' && x.active);
  if (rp) data.routines.forEach(r => { if (/lecture|lire/i.test(r.title)) r.projectId = rp.id; });

  // Santé
  if (p.modules.forme) {
    const pr = ob.profile;
    data.profile = { ...data.profile, ...pr };
    if (ob.weight && ob.weight !== latestWeight()) {
      const today = toISO(new Date());
      data.weights = data.weights.filter(w => isoWeekKey(w.date) !== isoWeekKey(today));
      data.weights.push({ date: today, kg: Math.round(ob.weight * 10) / 10 });
    }
  }

  // Clé Gemini : vérifiée en arrière-plan, la recherche IA s'active si elle est valide
  if (ob.geminiKey && ob.geminiKey !== data.settings.geminiKey) {
    const key = ob.geminiKey;
    pickGeminiModel(key)
      .then(model => { Object.assign(data.settings, { geminiKey: key, geminiModel: model, aiMode: 'gemini' }); save(); toast('Recherche IA des calories activée'); })
      .catch(err => toast(`Clé Gemini : ${err.message} (Réglages → Recherche IA)`));
  }

  data.settings.onboarded = true;
  save();
  closeOnboarding();
  state.tab = 'week';
  render();
  toast(wasOnboarded ? 'Préférences mises à jour' : `Bienvenue${p.name ? ` ${p.name}` : ''} ! Ta semaine t'attend`);
}
