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
  ['aws', '☁️ Certification AWS'], ['cert', '🎓 Autre certification'], ['code', '💻 Programmation'],
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
  goals: [], language: '', certName: '', bookThemes: [],
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

const OB_STEPS = ['welcome', 'modules', 'life', 'rhythm', 'sports', 'interests', 'goals', 'health', 'done'];
let ob = null; // état du questionnaire en cours

function startOnboarding(stepName) {
  ob = {
    step: 0, p: prefs(), profile: { ...data.profile }, weight: latestWeight() || '', geminiKey: data.settings.geminiKey || '',
    lifeText: (data.prefs && data.prefs.lifeText) || '', analyzedText: null, routines: [],
  };
  let el = document.getElementById('onboarding');
  if (!el) {
    el = document.createElement('div');
    el.id = 'onboarding';
    document.body.appendChild(el);
    el.addEventListener('click', onboardingClick);
  }
  document.body.classList.add('ob-open');
  if (stepName) ob.step = Math.max(0, obVisibleSteps().indexOf(stepName));
  renderOnboarding();
}

function obVisibleSteps() {
  return OB_STEPS.filter(s => (s !== 'goals' || ob.p.modules.goals) && (s !== 'health' || ob.p.modules.forme));
}

const chip = (group, id, label, on) => `<button type="button" class="chip selectable ${on ? 'active' : ''}" data-ob-chip="${group}" data-id="${id}">${label}</button>`;

function renderOnboarding() {
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
      <div class="field"><label>Clé Gemini <input type="password" data-ob-key value="${esc(ob.geminiKey || '')}" placeholder="AIza… (facultatif)" autocomplete="off"></label></div>`}`;
  } else if (name === 'rhythm') {
    const kept = ob.routines;
    body = `
      ${kept.length ? `
      <h1>Ce que j'ai compris</h1>
      <p class="ob-lead">Ces activités reviendront chaque semaine dans ton planning. Décoche ce qui ne va pas (tu pourras tout modifier ensuite).</p>
      <div class="field">${kept.map((r, i) => `
        <label><span><span class="dot" style="background:${cat(r.category).color};display:inline-block;margin-right:6px"></span><b>${esc(r.title)}</b><br>
          <small>${daysLabel(r.days)[0].toUpperCase() + daysLabel(r.days).slice(1)} · ${r.start}–${r.end}</small></span>
          <input type="checkbox" data-ob-routine="${i}" ${r.keep ? 'checked' : ''}></label>`).join('')}
      </div>` : ''}
      <h${kept.length ? '2 class="ob-sub"' : '1'}>Ton rythme</h${kept.length ? '2' : '1'}>
      <p class="ob-lead">Pour proposer des activités quand tu es vraiment libre.</p>
      <div class="chips">${[['etudiant', '🎓 Étudiant·e'], ['actif', '💼 En activité'], ['autre', '🌱 Autre']].map(([id, l]) => chip('situation', id, l, p.situation === id)).join('')}</div>
      <div class="field">
        <label>En semaine, je suis libre à partir de <input type="time" data-ob="eveningStart" value="${p.eveningStart}"></label>
        <label>Le week-end, je commence vers <input type="time" data-ob="weekendStart" value="${p.weekendStart}"></label>
        <label>Je me couche vers <input type="time" data-ob="bedtime" value="${p.bedtime}"></label>
      </div>`;
  } else if (name === 'sports') {
    body = `
      <h1>Tes sports</h1>
      <p class="ob-lead">Ceux que tu pratiques ou que tu aimerais pratiquer.</p>
      <div class="chips">${SPORTS.map(([id, l]) => chip('sports', id, l, p.sports.includes(id))).join('')}</div>
      <div class="field">
        <label>Autre <input type="text" data-ob="otherSport" value="${esc(p.otherSport)}" placeholder="Ex : rugby, surf…"></label>
        <label>Séances par semaine visées
          <span class="stepper"><button type="button" data-ob-step="-1">−</button><b>${p.sportPerWeek}</b><button type="button" data-ob-step="1">+</button></span></label>
      </div>`;
  } else if (name === 'interests') {
    body = `
      <h1>Tes centres d'intérêt</h1>
      <p class="ob-lead">L'app s'en sert pour te proposer des idées qui te ressemblent.</p>
      <div class="chips">${INTERESTS.map(([id, l]) => chip('interests', id, l, p.interests.includes(id))).join('')}</div>
      <div class="field"><label>Autre <input type="text" data-ob="otherInterest" value="${esc(p.otherInterest)}" placeholder="Ex : théâtre, pêche…"></label></div>`;
  } else if (name === 'goals') {
    body = `
      <h1>Tes objectifs perso</h1>
      <p class="ob-lead">L'app crée un projet pour chacun et planifie des sessions dans ta semaine.</p>
      <div class="chips">${GOALS.map(([id, l]) => chip('goals', id, l, p.goals.includes(id))).join('')}</div>
      ${p.goals.includes('cert') ? `<div class="field"><label>Quelle certification ? <input type="text" data-ob="certName" value="${esc(p.certName)}" placeholder="Ex : Azure, Google Cloud…"></label></div>` : ''}
      ${p.goals.includes('language') ? `<div class="field"><label>Quelle langue ? <input type="text" data-ob="language" value="${esc(p.language)}" placeholder="Ex : anglais"></label></div>` : ''}
      ${p.goals.includes('reading') ? `<p class="ob-lead" style="margin-top:14px">Ce que tu aimes lire :</p><div class="chips">${BOOK_THEMES.map(([id, l]) => chip('bookThemes', id, l, p.bookThemes.includes(id))).join('')}</div>` : ''}
      ${p.situation === 'etudiant' ? '<p class="help">🎓 Tu pourras connecter Moodle dans l\'onglet Objectifs pour importer cours et devoirs.</p>' : ''}`;
  } else if (name === 'health') {
    const pr = ob.profile;
    body = `
      <h1>Ton profil santé</h1>
      <p class="ob-lead">Pour calculer tes besoins caloriques. Reste sur ton téléphone.</p>
      <div class="field">
        <label>Sexe <select data-obp="sex"><option value="">–</option><option value="h" ${pr.sex === 'h' ? 'selected' : ''}>Homme</option><option value="f" ${pr.sex === 'f' ? 'selected' : ''}>Femme</option></select></label>
        <label>Âge <input type="number" data-obp="age" inputmode="numeric" value="${pr.age || ''}"></label>
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
      <div class="field"><label>Clé Gemini <input type="password" data-ob-key value="" placeholder="AIza… (facultatif)" autocomplete="off"></label></div>`}`;
  } else {
    const n = buildIdeas(p).length;
    body = `
      <div class="ob-hero">✨</div>
      <h1>C'est prêt${first} !</h1>
      <ul class="ob-recap">
        ${ob.routines.filter(r => r.keep).length ? `<li>${ob.routines.filter(r => r.keep).length} activités régulières ajoutées à ton planning</li>` : ''}
        <li>${n} idées d'activités adaptées à tes goûts</li>
        ${p.modules.goals && p.goals.length ? `<li>${p.goals.length} projet${p.goals.length > 1 ? 's' : ''} créé${p.goals.length > 1 ? 's' : ''} dans Objectifs</li>` : ''}
        <li>Propositions entre ${p.eveningStart} et ${p.bedtime} en semaine, dès ${p.weekendStart} le week-end</li>
        ${p.sports.length || p.otherSport ? `<li>Objectif : ${p.sportPerWeek} séance${p.sportPerWeek > 1 ? 's' : ''} de sport par semaine</li>` : ''}
      </ul>
      <p class="ob-lead">Note tes activités au fil des jours : l'app repère tes routines, ajuste ses propositions et retient ce que tu refuses.</p>`;
  }
  const last = ob.step === steps.length - 1;
  document.getElementById('onboarding').innerHTML = `
    <div class="ob-inner">
      <div class="ob-dots">${steps.map((_, i) => `<span class="${i <= ob.step ? 'on' : ''}"></span>`).join('')}</div>
      <div class="ob-body">${body}</div>
      <div class="ob-nav">
        ${ob.step > 0 ? '<button type="button" class="secondary" data-ob-nav="back">Retour</button>' : (data.settings.onboarded ? '<button type="button" class="secondary" data-ob-nav="close">Annuler</button>' : '')}
        <button type="button" class="primary" data-ob-nav="${last ? 'finish' : 'next'}">${last ? 'C\'est parti' : 'Continuer'}</button>
      </div>
    </div>`;
  document.getElementById('onboarding').scrollTop = 0;
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
  const w = el.querySelector('[data-ob-weight]');
  if (w) ob.weight = parseFloat(String(w.value).replace(',', '.')) || '';
}

function onboardingClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  readOnboardingFields();
  if (t.dataset.obChip) {
    const g = t.dataset.obChip;
    const id = t.dataset.id;
    if (g === 'situation') ob.p.situation = ob.p.situation === id ? '' : id;
    else ob.p[g] = ob.p[g].includes(id) ? ob.p[g].filter(x => x !== id) : [...ob.p[g], id];
    renderOnboarding();
  } else if (t.dataset.obStep) {
    ob.p.sportPerWeek = Math.max(0, Math.min(14, ob.p.sportPerWeek + +t.dataset.obStep));
    renderOnboarding();
  } else if (t.dataset.obNav === 'next') {
    if (obVisibleSteps()[ob.step] === 'life' && ob.lifeText && ob.lifeText !== ob.analyzedText) analyzeLifeStep(t);
    else { ob.step++; renderOnboarding(); }
  }
  else if (t.dataset.obNav === 'back') { ob.step--; renderOnboarding(); }
  else if (t.dataset.obNav === 'close') closeOnboarding();
  else if (t.dataset.obNav === 'finish') finishOnboarding();
}

// Analyse le texte libre puis passe à l'étape suivante, pré-remplie
async function analyzeLifeStep(btn) {
  btn.disabled = true;
  btn.textContent = 'Analyse en cours…';
  const res = await analyzeLife(ob.lifeText, ob.geminiKey || data.settings.geminiKey);
  if (!ob) return;
  // Clé validée par l'analyse : on l'enregistre tout de suite (elle sert aussi aux calories)
  if (res.by === 'ia' && ob.geminiKey && ob.geminiKey !== data.settings.geminiKey) {
    Object.assign(data.settings, { geminiKey: ob.geminiKey, aiMode: 'gemini' });
    save();
  }
  applyLifeToOnboarding(res);
  ob.analyzedText = ob.lifeText;
  ob.step++;
  renderOnboarding();
  if (res.error) toast(`IA indisponible (${res.error}) : analyse simplifiée`);
  else toast(res.routines.length ? `${res.routines.length} activité${res.routines.length > 1 ? 's' : ''} régulière${res.routines.length > 1 ? 's' : ''} repérée${res.routines.length > 1 ? 's' : ''}` : 'Rien de régulier repéré : complète les étapes suivantes');
}

function closeOnboarding() {
  const el = document.getElementById('onboarding');
  if (el) el.remove();
  document.body.classList.remove('ob-open');
  ob = null;
}

// ---------- Application des réponses ----------

function buildIdeas(p) {
  const out = [];
  SPORTS.filter(([id]) => p.sports.includes(id)).forEach(([, title, duration]) => out.push({ title, category: 'sport', duration }));
  if (p.otherSport) p.otherSport.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(title => out.push({ title: title[0].toUpperCase() + title.slice(1), category: 'sport', duration: 60 }));
  INTERESTS.filter(([id]) => p.interests.includes(id)).forEach(([, title, category, duration, at]) => out.push({ title, category, duration, ...(at ? { at } : {}) }));
  if (p.otherInterest) p.otherInterest.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(title => out.push({ title: title[0].toUpperCase() + title.slice(1), category: 'loisirs', duration: 90 }));
  ALWAYS_IDEAS.forEach(([title, category, duration]) => out.push({ title, category, duration }));
  return out;
}

function projectsFromGoals(p) {
  const out = [];
  p.goals.forEach(g => {
    if (g === 'aws') out.push(newProject('aws'));
    else if (g === 'code') out.push(newProject('code'));
    else if (g === 'reading') out.push(newProject('reading'));
    else if (g === 'cert') out.push({ ...newProject('custom'), title: `Certification ${p.certName || ''}`.trim(), icon: '🎓', type: 'cert', category: 'etudes', weeklyMinutes: 150 });
    else if (g === 'language') out.push({ ...newProject('custom'), title: `Apprendre ${p.language ? `l'${p.language}`.replace(/^l'([^aeiouyh])/i, 'le $1') : 'une langue'}`, icon: '🗣️', type: 'learning', category: 'etudes', weeklyMinutes: 105, session: 30 });
    else if (g === 'instrument') out.push({ ...newProject('custom'), title: 'Jouer d\'un instrument', icon: '🎸', category: 'loisirs', weeklyMinutes: 120, session: 30 });
    else out.push({ ...newProject('custom'), title: 'Mon projet' });
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
