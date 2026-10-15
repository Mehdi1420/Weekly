'use strict';

// ---------- « Ta semaine en quelques mots » ----------
// L'utilisateur décrit librement ce qu'il fait (travail, cours, sport, petites habitudes…).
// Avec une clé Gemini, l'IA en extrait les routines et les préférences ; sinon un analyseur
// intégré reconnaît les formulations courantes (« du lundi au vendredi de 9h à 17h », « le mardi soir »…).

const DAY_NAMES_RE = 'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche';
const DAY_INDEX = { lundi: 0, mardi: 1, mercredi: 2, jeudi: 3, vendredi: 4, samedi: 5, dimanche: 6 };

// minuscules, sans accents, apostrophes en espaces (les « h » et « : » des heures sont gardés)
const lite = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['’]/g, ' ').replace(/-/g, ' - ').replace(/\s+/g, ' ');

// Activités reconnues : l'ordre compte (« cours à pied » avant « cours »)
const LIFE_RULES = [
  { re: /\b(alternance|alternant)\b/, title: 'Alternance', category: 'travail', dur: 480 },
  { re: /\bstage\b/, title: 'Stage', category: 'travail', dur: 480 },
  { re: /\b(travail|travaille|bosse|boulot|taf|job|bureau|entreprise)\b/, title: 'Travail', category: 'travail', dur: 480 },
  { re: /\b(cours a pied|courir|running|jogging|footing|je cours)\b/, title: 'Course à pied', category: 'sport', dur: 45, sport: 'course' },
  { re: /\b(cours|fac|universite|univ|ecole|lycee|amphi|td|tp)\b/, title: 'Cours', category: 'etudes', dur: 240 },
  { re: /\b(foot|football|futsal)\b/, title: 'Football', category: 'sport', dur: 90, sport: 'foot' },
  { re: /\b(muscu|musculation|salle de sport|la salle|fitness|crossfit)\b/, title: 'Musculation', category: 'sport', dur: 60, sport: 'muscu' },
  { re: /\b(natation|piscine|nage)\b/, title: 'Natation', category: 'sport', dur: 45, sport: 'natation' },
  { re: /\b(velo|cyclisme)\b/, title: 'Vélo', category: 'sport', dur: 60, sport: 'velo' },
  { re: /\byoga\b/, title: 'Yoga', category: 'sport', dur: 30, sport: 'yoga' },
  { re: /\btennis\b/, title: 'Tennis', category: 'sport', dur: 60, sport: 'tennis' },
  { re: /\bpadel\b/, title: 'Padel', category: 'sport', dur: 90, sport: 'padel' },
  { re: /\bbasket\b/, title: 'Basket', category: 'sport', dur: 90, sport: 'basket' },
  { re: /\b(escalade|grimpe|bloc)\b/, title: 'Escalade', category: 'sport', dur: 90, sport: 'escalade' },
  { re: /\b(boxe|mma|judo|karate|jiu jitsu|taekwondo|arts martiaux)\b/, title: 'Boxe / arts martiaux', category: 'sport', dur: 60, sport: 'boxe' },
  { re: /\bdanse\b/, title: 'Danse', category: 'sport', dur: 60, sport: 'danse' },
  { re: /\b(randonnee|rando)\b/, title: 'Randonnée', category: 'sport', dur: 180, sport: 'rando' },
  { re: /\b(lis|lire|lecture|bouquin|livres?)\b/, title: 'Lecture', category: 'loisirs', dur: 30, reading: true },
  { re: /\b(meditation|medite)\b/, title: 'Méditation', category: 'sante', dur: 15, interest: 'meditation' },
  { re: /\b(courses|supermarche)\b/, title: 'Courses', category: 'maison', dur: 60 },
  { re: /\bmenage\b/, title: 'Ménage', category: 'maison', dur: 60 },
  { re: /\b(jeux video|jeu video|console|gaming|play)\b/, title: 'Jeux vidéo', category: 'loisirs', dur: 90, interest: 'jeux' },
  { re: /\b(guitare|piano|batterie|violon|musique)\b/, title: 'Musique', category: 'loisirs', dur: 45, interest: 'musique' },
  { re: /\b(famille|parents)\b/, title: 'Famille', category: 'social', dur: 120, interest: 'famille' },
  { re: /\b(amis|potes|copains)\b/, title: 'Sortie entre amis', category: 'social', dur: 150, interest: 'sortie' },
  { re: /\bcinema\b/, title: 'Cinéma', category: 'loisirs', dur: 150, interest: 'cinema' },
];

const NUM_WORDS = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7 };

function parseDaysLife(c) {
  if (/\b(tous les jours|chaque jour|tous les soirs|chaque soir|tous les matins|chaque matin|quotidien)/.test(c)) return [0, 1, 2, 3, 4, 5, 6];
  const set = new Set();
  let rest = c;
  if (/\b(en semaine|jours de semaine|jours ouvres)\b/.test(rest)) [0, 1, 2, 3, 4].forEach(d => set.add(d));
  if (/\bweek ?end\b/.test(rest)) { set.add(5); set.add(6); }
  const range = new RegExp(`(?:du |de )?(${DAY_NAMES_RE})s? (?:au|a|jusqu au|-) (${DAY_NAMES_RE})`, 'g');
  rest = rest.replace(range, (_, a, b) => {
    for (let d = DAY_INDEX[a]; ; d = (d + 1) % 7) { set.add(d); if (d === DAY_INDEX[b]) break; }
    return ' ';
  });
  (rest.match(new RegExp(`\\b(${DAY_NAMES_RE})s?\\b`, 'g')) || []).forEach(n => set.add(DAY_INDEX[n.replace(/s$/, '')]));
  return [...set].sort((a, b) => a - b);
}

const hm = (h, m) => `${String(Math.min(23, +h)).padStart(2, '0')}:${String(m ? +m : 0).padStart(2, '0')}`;

function parseTimesLife(c, rule, days = []) {
  const H = '(\\d{1,2})\\s?(?:h|:)\\s?(\\d{2})?';
  const m = c.match(new RegExp(`${H}\\s?(?:a|et|-|jusqu a)\\s?${H}`));
  if (m) return { start: hm(m[1], m[2]), end: hm(m[3], m[4]) };
  const m2 = c.match(/\b(\d{1,2})\s?(?:a|-)\s?(\d{1,2})\s?h\s?(\d{2})?/); // « de 9 à 17h »
  if (m2) return { start: hm(m2[1]), end: hm(m2[2], m2[3]) };
  const one = c.match(new RegExp(`(?:a|vers|des|a partir de|aux alentours de)\\s${H}`));
  let start = one ? hm(one[1], one[2]) : null;
  if (!start) {
    if (/avant de (dormir|me coucher)|au lit|en me couchant/.test(c)) start = '22:30';
    else if (/\bmidi\b|pause dej/.test(c)) start = '12:30';
    else if (/apres midi|aprem/.test(c)) start = '14:00';
    else if (/\bsoir|soiree\b/.test(c)) start = rule.category === 'sport' ? '19:30' : '20:00';
    else if (/\bmatin\b/.test(c)) start = rule.category === 'sport' ? '07:30' : '09:00';
  }
  if (!start) {
    // Jour connu mais pas d'heure : une heure plausible selon le type d'activité
    if (rule.category === 'travail') return { start: '09:00', end: '17:30' };
    if (rule.category === 'etudes') return { start: '08:30', end: '17:00' };
    const weekend = days.length && days.every(d => d >= 5);
    start = {
      sport: weekend ? '10:30' : '18:30', social: weekend ? '14:00' : '19:30', loisirs: weekend ? '15:00' : '20:30',
      maison: weekend ? '10:00' : '19:00', sante: '08:00',
    }[rule.category] || null;
    if (!start) return null;
  }
  return { start, end: fromMin(Math.min(toMin(start) + rule.dur, 23 * 60 + 59)) };
}

function analyzeLifeLocal(text) {
  const out = { situation: '', routines: [], sports: [], otherSports: [], sportPerWeek: null, interests: [], goals: [], language: '', certName: '', bedtime: '' };
  const clauses = lite(text).split(/[.;!?\n]+|,\s*(?=(?:et |puis |sinon |aussi |je |j |le |la |les |du |tous |chaque ))/);
  let sportFreq = 0;
  clauses.forEach(clause => {
    // Plusieurs activités dans une même phrase : chacune garde le texte qui la suit
    const hits = [];
    LIFE_RULES.forEach(rule => {
      const m = clause.match(rule.re);
      if (m && !hits.some(h => m.index >= h.index && m.index < h.index + h.len)) hits.push({ rule, index: m.index, len: m[0].length });
    });
    hits.sort((a, b) => a.index - b.index);
    hits.forEach((h, i) => {
      const seg = clause.slice(i === 0 ? 0 : h.index, i + 1 < hits.length ? hits[i + 1].index : clause.length);
      const { rule } = h;
      if (rule.sport && !out.sports.includes(rule.sport)) out.sports.push(rule.sport);
      if (rule.interest && !out.interests.includes(rule.interest)) out.interests.push(rule.interest);
      if (rule.reading && !out.goals.includes('reading')) out.goals.push('reading');
      const freq = seg.match(/\b(\d|une|un|deux|trois|quatre|cinq|six|sept) fois par semaine/);
      if (freq && rule.category === 'sport') sportFreq += NUM_WORDS[freq[1]] || +freq[1];
      const days = parseDaysLife(seg);
      if (!days.length) return;
      const t = parseTimesLife(seg, rule, days);
      if (!t) return;
      if (rule.category === 'sport') sportFreq += freq ? 0 : days.length;
      const existing = out.routines.find(r => r.title === rule.title && r.start === t.start && r.end === t.end);
      if (existing) existing.days = [...new Set([...existing.days, ...days])].sort((a, b) => a - b);
      else out.routines.push({ title: rule.title, category: rule.category, days, start: t.start, end: t.end });
    });
  });
  const all = lite(text);
  const noRun = all.replace(/\b(je cours|cours a pied|courir)\b/g, ' '); // « je cours » = course à pied, pas des cours
  if (/\b(cours|fac|universite|etudiante?|etudes|ecole|alternance|amphi)\b/.test(noRun)) out.situation = 'etudiant';
  else if (/\b(travail|travaille|bosse|boulot|job|cdi|cdd|salarie)\b/.test(all)) out.situation = 'actif';
  if (/\baws\b/.test(all)) out.goals.push('aws');
  else if (/\bcertif/.test(all)) { out.goals.push('cert'); out.certName = ((text.match(/certification\s+([A-Za-zÀ-ÿ0-9 ]{2,30})/i) || [])[1] || '').trim(); }
  if (/\b(programmation|programmer|coder|developpeur|developpement|python|javascript|java)\b/.test(all)) out.goals.push('code');
  const lang = all.match(/\b(anglais|espagnol|allemand|italien|chinois|japonais|arabe|coreen|portugais|russe|neerlandais)\b/);
  if (lang && /\b(apprendre|apprends|langue|progresser|ameliorer|cours d)\b/.test(all)) { out.goals.push('language'); out.language = lang[1]; }
  if (/\b(guitare|piano|batterie|violon)\b/.test(all) && /\b(apprendre|apprends|progresser)\b/.test(all)) out.goals.push('instrument');
  const bed = all.match(/\b(?:couche|dors|coucher|dormir)\b[^.]*?\b(?:vers|a)\s(\d{1,2})\s?(?:h|:)\s?(\d{2})?/);
  if (bed) out.bedtime = hm(bed[1], bed[2]);
  if (sportFreq) out.sportPerWeek = Math.min(14, sportFreq);
  out.goals = [...new Set(out.goals)];
  return out;
}

// ---------- Analyse par l'IA (Gemini) ----------

async function analyzeLifeAI(text, key, deep = false) {
  if (!data.settings.geminiModel || data.settings.geminiKey !== key) data.settings.geminiModel = await pickGeminiModel(key);
  const sportIds = SPORTS.map(s => s[0]).join(', ');
  const interestIds = INTERESTS.map(s => s[0]).join(', ');
  const body = {
    systemInstruction: { parts: [{ text:
      'Tu analyses la description libre qu\'un utilisateur fait de sa semaine type, pour configurer une app de planning. ' +
      'Extrais : 1) les activités RÉGULIÈRES à jours fixes (travail, alternance, cours, sport, lecture, etc.) avec leurs jours ' +
      '(0 = lundi … 6 = dimanche) et horaires HH:MM ; si l\'heure est vague (le soir, avant de dormir…), estime une heure plausible ; ' +
      'si la durée n\'est pas donnée, estime-la ; titres courts en français ; ' +
      'catégorie parmi : travail, etudes, sport, social, loisirs, maison, sante, autre. ' +
      `2) les sports pratiqués (identifiants parmi : ${sportIds} ; sinon le nom en français) et le nombre total de séances de sport par semaine. ` +
      `3) les centres d'intérêt (identifiants parmi : ${interestIds} ; sinon le nom). ` +
      '4) les objectifs perso (identifiants parmi : aws, cert, code, language, reading, instrument), avec la langue et le nom de la certification si mentionnés. ' +
      '5) la situation (etudiant, actif ou autre ; alternance = etudiant) et l\'heure de coucher (HH:MM) si mentionnée. ' +
      'N\'invente rien qui ne soit pas dans le texte ; laisse vide ce qui est inconnu.' }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          situation: { type: 'STRING' },
          bedtime: { type: 'STRING' },
          routines: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
            title: { type: 'STRING' }, category: { type: 'STRING' }, days: { type: 'ARRAY', items: { type: 'INTEGER' } },
            start: { type: 'STRING' }, end: { type: 'STRING' } }, required: ['title', 'category', 'days', 'start', 'end'] } },
          sports: { type: 'ARRAY', items: { type: 'STRING' } },
          sportsPerWeek: { type: 'INTEGER' },
          interests: { type: 'ARRAY', items: { type: 'STRING' } },
          goals: { type: 'ARRAY', items: { type: 'STRING' } },
          language: { type: 'STRING' },
          certName: { type: 'STRING' },
        },
        required: ['routines'],
      },
    },
  };
  const res = await geminiGenerate(data.settings.geminiModel, key, body, { deep });
  const part = res.candidates && res.candidates[0] && res.candidates[0].content && res.candidates[0].content.parts.find(p => p.text);
  if (!part) throw new Error('réponse vide');
  return cleanLifeResult(JSON.parse(part.text));
}

// Valide et normalise ce que renvoie l'IA (on ne garde que des valeurs utilisables)
function cleanLifeResult(r) {
  const time = t => (/^\d{1,2}:\d{2}$/.test(t || '') ? hm(...t.split(':')) : '');
  const catIds = CATEGORIES.map(c => c.id);
  const sportIds = SPORTS.map(s => s[0]);
  const interestIds = INTERESTS.map(s => s[0]);
  const goalIds = GOALS.map(g => g[0]);
  const routines = (r.routines || []).map(x => ({
    title: String(x.title || '').trim().slice(0, 60),
    category: catIds.includes(x.category) ? x.category : 'autre',
    days: [...new Set((x.days || []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b),
    start: time(x.start), end: time(x.end),
  })).filter(x => x.title && x.days.length && x.start && x.end && toMin(x.end) > toMin(x.start));
  const sports = (r.sports || []).map(s => String(s).trim()).filter(Boolean);
  const interests = (r.interests || []).map(s => String(s).trim()).filter(Boolean);
  return {
    situation: ['etudiant', 'actif', 'autre'].includes(r.situation) ? r.situation : '',
    bedtime: time(r.bedtime),
    routines,
    sports: sports.filter(s => sportIds.includes(s)),
    otherSports: sports.filter(s => !sportIds.includes(s)),
    sportPerWeek: Number.isInteger(r.sportsPerWeek) && r.sportsPerWeek > 0 ? Math.min(14, r.sportsPerWeek) : null,
    interests: interests.filter(s => interestIds.includes(s)),
    otherInterests: interests.filter(s => !interestIds.includes(s)),
    goals: (r.goals || []).filter(g => goalIds.includes(g)),
    language: String(r.language || '').trim(),
    certName: String(r.certName || '').trim(),
  };
}

// Analyse : IA si une clé est disponible, sinon (ou en cas d'erreur) analyseur intégré
async function analyzeLife(text, key, { deep = false } = {}) {
  if (key && navigator.onLine) {
    try {
      return { ...(await analyzeLifeAI(text, key, deep)), by: 'ia' };
    } catch (e) {
      return { ...analyzeLifeLocal(text), by: 'local', error: e.message };
    }
  }
  return { ...analyzeLifeLocal(text), by: 'local' };
}

// Pré-remplit le questionnaire avec ce qui a été compris
// L'analyse peut arriver pendant que l'utilisateur continue le questionnaire : on ne remplace pas
// ce qu'il a déjà modifié lui-même (ob.touched), on complète seulement.
function applyLifeToOnboarding(res) {
  const p = ob.p;
  const mine = k => ob.touched && ob.touched.has(k);
  ob.routines = res.routines.map(r => ({ ...r, keep: true }));
  if (res.situation) p.situation = res.situation;
  if (res.bedtime && !mine('bedtime')) p.bedtime = res.bedtime;
  // Libre en semaine : après la fin du travail ou des cours (le plus tard en semaine) + 30 min
  const ends = res.routines.filter(r => ['travail', 'etudes'].includes(r.category) && r.days.some(d => d < 5)).map(r => toMin(r.end));
  if (ends.length && !mine('eveningStart')) p.eveningStart = fromMin(Math.min(21 * 60, Math.ceil((Math.max(...ends) + 30) / 15) * 15));
  p.sports = [...new Set([...p.sports, ...res.sports])];
  const other = [...new Set([...(p.otherSport ? p.otherSport.split(/,\s*/) : []), ...(res.otherSports || [])])].filter(Boolean);
  p.otherSport = other.join(', ');
  if (res.sportPerWeek && !mine('sportPerWeek')) p.sportPerWeek = res.sportPerWeek;
  p.interests = [...new Set([...p.interests, ...res.interests])];
  const oi = [...new Set([...(p.otherInterest ? p.otherInterest.split(/,\s*/) : []), ...(res.otherInterests || [])])].filter(Boolean);
  p.otherInterest = oi.join(', ');
  p.goals = [...new Set([...p.goals, ...res.goals])];
  if (res.language) p.language = res.language;
  if (res.certName) p.certName = res.certName;
  if ((res.goals.length || res.routines.some(r => r.category === 'etudes')) && !mine('modules')) p.modules.goals = true;
}
