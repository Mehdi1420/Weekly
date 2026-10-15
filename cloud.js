'use strict';

// ---------- Compte et synchronisation (Supabase) ----------
// Les données restent aussi sur l'appareil (l'app marche hors connexion) ; avec un compte,
// elles sont envoyées sur le serveur et retrouvées sur tout appareil connecté au même compte
// (iPhone, ordinateur…). Chaque utilisateur ne peut lire et modifier que ses propres données
// (règles de sécurité de la base, voir supabase/schema.sql).
// Appels HTTP directs aux API Supabase (Auth et REST) : l'app n'a pas d'étape de build.

const CLOUD = window.MA_SEMAINE_CONFIG || {};
const SESSION_KEY = 'ma-semaine-session';
const GUEST_KEY = 'ma-semaine-guest';
const PUSH_DELAY = 1500;

const cloudEnabled = () => !!(CLOUD.supabaseUrl && CLOUD.supabaseKey);

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
}
function setSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

// Clé de stockage local : une par compte, et une pour l'utilisation sans compte
function storageKeyFor(session) {
  return session ? `ma-semaine-u-${session.user.id}` : 'ma-semaine-v1';
}

const authErrors = {
  invalid_credentials: 'E-mail ou mot de passe incorrect',
  'Invalid login credentials': 'E-mail ou mot de passe incorrect',
  user_already_exists: 'Un compte existe déjà avec cet e-mail : connecte-toi',
  'User already registered': 'Un compte existe déjà avec cet e-mail : connecte-toi',
  email_not_confirmed: 'Confirme d\'abord ton e-mail (lien reçu par mail), puis connecte-toi',
  'Email not confirmed': 'Confirme d\'abord ton e-mail (lien reçu par mail), puis connecte-toi',
  weak_password: 'Mot de passe trop faible (8 caractères minimum)',
  same_password: 'Choisis un mot de passe différent de l\'ancien',
  'New password should be different from the old password.': 'Choisis un mot de passe différent de l\'ancien',
  bad_jwt: 'Ce lien a expiré : redemande un e-mail',
  over_email_send_rate_limit: 'Trop d\'e-mails envoyés, réessaie dans quelques minutes',
};

async function supa(path, { method = 'GET', body, token, headers = {} } = {}) {
  const res = await fetch(`${CLOUD.supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: CLOUD.supabaseKey,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  if (!res.ok) {
    const code = json && (json.error_code || json.code || json.error);
    const msg = json && (json.msg || json.message || json.error_description);
    const err = new Error(authErrors[code] || authErrors[msg] || msg || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

function sessionFrom(r) {
  return {
    access_token: r.access_token, refresh_token: r.refresh_token,
    expires_at: Date.now() + (r.expires_in || 3600) * 1000,
    user: { id: r.user.id, email: r.user.email },
  };
}

async function validSession() {
  const s = getSession();
  if (!s) return null;
  if (s.expires_at - 60000 > Date.now()) return s;
  try {
    const r = await supa('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } });
    const ns = sessionFrom(r);
    setSession(ns);
    return ns;
  } catch (e) {
    if (e.status === 400 || e.status === 401) { // session révoquée ou expirée : il faut se reconnecter
      setSession(null);
      cloudState.expired = true;
    }
    return null;
  }
}

// ---------- Synchronisation ----------

const cloudState = { pushTimer: null, pushing: false, lastSync: null, error: null, expired: false };

function cloudSchedulePush() {
  if (!cloudEnabled() || !getSession()) return;
  clearTimeout(cloudState.pushTimer);
  cloudState.pushTimer = setTimeout(cloudPush, PUSH_DELAY);
}

async function cloudPush() {
  const s = await validSession();
  if (!s || !navigator.onLine) return;
  cloudState.pushing = true;
  try {
    await supa('/rest/v1/user_data?on_conflict=user_id', {
      method: 'POST', token: s.access_token,
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: s.user.id, data, updated_at: new Date(data.meta.updatedAt).toISOString() },
    });
    data.meta.syncedAt = data.meta.updatedAt;
    localStorage.setItem(storageKeyFor(s), JSON.stringify(data));
    cloudState.lastSync = Date.now();
    cloudState.error = null;
  } catch (e) {
    cloudState.error = e.message;
  } finally {
    cloudState.pushing = false;
  }
}

async function fetchRemote(s) {
  const rows = await supa(`/rest/v1/user_data?select=data,updated_at&user_id=eq.${s.user.id}`, { token: s.access_token });
  return rows && rows[0] ? rows[0] : null;
}

// Récupère la version du serveur si elle est plus récente que celle de l'appareil
async function cloudPull() {
  const s = await validSession();
  if (!s || !navigator.onLine) return false;
  try {
    const row = await fetchRemote(s);
    cloudState.lastSync = Date.now();
    cloudState.error = null;
    const remoteAt = row ? new Date(row.updated_at).getTime() : 0;
    const localAt = (data.meta && data.meta.updatedAt) || 0;
    const unsynced = data.meta && data.meta.updatedAt !== data.meta.syncedAt;
    if (row && remoteAt > localAt) {
      data = withDefaults(row.data);
      data.meta = { ...(data.meta || {}), updatedAt: remoteAt, syncedAt: remoteAt };
      localStorage.setItem(storageKeyFor(s), JSON.stringify(data));
      return true;
    }
    if (!row || unsynced) cloudSchedulePush(); // l'appareil a des changements pas encore envoyés
  } catch (e) {
    cloudState.error = e.message;
  }
  return false;
}

// ---------- Connexion ----------

const isEmptyData = d => !d || (!(d.events || []).length && !(d.food || []).length && !(d.weights || []).length
  && !(d.tasks || []).length && !(d.projects || []).length && !(d.settings && d.settings.onboarded));

// Après connexion : on reprend les données du compte, ou celles de l'appareil si le compte est vide
async function afterSignIn(s) {
  setSession(s);
  localStorage.removeItem(GUEST_KEY);
  cloudState.expired = false;
  const local = (() => { try { return JSON.parse(localStorage.getItem(storageKeyFor(null))); } catch { return null; } })();
  const cached = (() => { try { return JSON.parse(localStorage.getItem(storageKeyFor(s))); } catch { return null; } })();
  const row = await fetchRemote(s);
  let chosen;
  if (row && !isEmptyData(row.data)) {
    // Le compte et l'appareil ont tous deux des données : on demande lesquelles garder
    const keepDevice = local && !isEmptyData(local)
      && !confirm('Ce compte a déjà des données.\n\nOK : garder celles du compte\nAnnuler : les remplacer par celles de cet appareil');
    chosen = keepDevice ? local : row.data;
  } else {
    chosen = !isEmptyData(local) ? local : (cached || local || null);
  }
  data = withDefaults(chosen || { events: [], ideas: DEFAULT_IDEAS.map(i => ({ id: uid(), notes: '', ...i })) });
  // Les données de l'appareil sont maintenant rattachées au compte
  localStorage.removeItem(storageKeyFor(null));
  save();
  await cloudPush();
}

async function signIn(email, password) {
  const r = await supa('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  await afterSignIn(sessionFrom(r));
}

async function signUp(email, password) {
  const r = await supa('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (r && r.access_token) { await afterSignIn(sessionFrom(r)); return 'connected'; }
  return 'confirm'; // confirmation par e-mail activée sur le projet
}

async function signOut() {
  const s = getSession();
  if (s) {
    await cloudPush();
    try { await supa('/auth/v1/logout', { method: 'POST', token: s.access_token }); } catch { /* déjà expirée */ }
    localStorage.removeItem(storageKeyFor(s)); // rien ne reste sur l'appareil après déconnexion
  }
  setSession(null);
}

// Le lien de l'e-mail ramène sur l'app, qui propose alors de choisir un nouveau mot de passe
async function resetPassword(email) {
  const back = encodeURIComponent(location.origin + location.pathname);
  await supa(`/auth/v1/recover?redirect_to=${back}`, { method: 'POST', body: { email } });
}

// Retour depuis le lien « mot de passe oublié » : Supabase met les jetons dans l'adresse (#access_token=…&type=recovery)
let pendingRecovery = null;
function readAuthRedirect() {
  if (!location.hash.includes('=')) return null;
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('access_token') && !h.has('error')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (h.get('error')) {
    const expired = h.get('error_code') === 'otp_expired';
    return { error: expired ? 'Ce lien a expiré ou a déjà servi : redemande un e-mail.' : (h.get('error_description') || 'Lien invalide') };
  }
  if (h.get('type') === 'recovery') {
    pendingRecovery = { access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: +h.get('expires_in') || 3600 };
    return { mode: 'reset' };
  }
  return null;
}

async function setNewPassword(password) {
  const r = pendingRecovery;
  const user = await supa('/auth/v1/user', { method: 'PUT', token: r.access_token, body: { password } });
  pendingRecovery = null;
  await afterSignIn(sessionFrom({ ...r, user }));
  return user.email;
}

async function deleteCloudData() {
  const s = await validSession();
  if (!s) return;
  await supa(`/rest/v1/user_data?user_id=eq.${s.user.id}`, { method: 'DELETE', token: s.access_token });
}

// ---------- Écran de connexion ----------

let authMode = 'login';

const AUTH_TEXT = {
  login: { title: 'Weekly', lead: 'Connecte-toi pour retrouver tes données sur tous tes appareils.', submit: 'Se connecter', pwd: 'current-password', ph: '' },
  reset: { title: 'Nouveau mot de passe', lead: 'Choisis ton nouveau mot de passe : tu seras connecté directement.', submit: 'Enregistrer et me connecter', pwd: 'new-password', ph: '8 caractères minimum' },
  signup: { title: 'Créer ton compte', lead: 'Tes données seront liées à ton compte et retrouvées sur tous tes appareils.', submit: 'Créer mon compte', pwd: 'new-password', ph: '8 caractères minimum' },
};

function showAuth(mode = 'login', message = '') {
  authMode = mode;
  let el = document.getElementById('auth');
  if (!el) {
    el = document.createElement('div');
    el.id = 'auth';
    document.body.appendChild(el);
    el.addEventListener('click', onAuthClick);
    el.addEventListener('submit', onAuthSubmit);
  }
  document.body.classList.add('ob-open');
  const email = el.querySelector('[name=email]')?.value || '';
  const forgot = mode === 'forgot';
  const t = AUTH_TEXT[mode] || AUTH_TEXT.login;
  el.innerHTML = `
    <form class="ob-inner auth-inner" novalidate>
      <div class="ob-body">
        <img class="auth-logo" src="icons/icon-192.png" alt="">
        <h1 data-t="title">${forgot ? 'Mot de passe oublié' : t.title}</h1>
        <p class="ob-lead" data-t="lead">${forgot ? 'Tu vas recevoir un e-mail pour choisir un nouveau mot de passe.' : t.lead}</p>
        ${!forgot && mode !== 'reset' ? `<div class="seg ${mode === 'signup' ? 'right' : ''}"><button type="button" data-auth="login" class="${mode !== 'signup' ? 'on' : ''}">Connexion</button><button type="button" data-auth="signup" class="${mode === 'signup' ? 'on' : ''}">Créer un compte</button></div>` : ''}
        <div class="field">
          ${mode === 'reset' ? '' : `<label>E-mail <input type="email" name="email" autocomplete="email" inputmode="email" required value="${esc(email)}"></label>`}
          ${forgot ? '' : `<label>${mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'} <input type="password" name="password" autocomplete="${t.pwd}" minlength="8" required placeholder="${t.ph}"></label>`}
        </div>
        ${forgot || mode === 'reset' ? '' : `<button type="button" class="text-btn forgot-link" data-auth="forgot" ${mode === 'signup' ? 'hidden' : ''}>Mot de passe oublié ?</button>`}
        ${message ? `<p class="auth-msg">${esc(message)}</p>` : ''}
        <button type="submit" class="primary" data-t="submit">${forgot ? 'Envoyer l\'e-mail' : t.submit}</button>
        ${forgot ? '<button type="button" class="text-btn auth-link" data-auth="login">← Retour à la connexion</button>' : ''}
        ${getSession() || mode === 'reset' ? '' : '<button type="button" class="text-btn auth-link muted" data-auth="guest">Continuer sans compte</button>'}
      </div>
    </form>`;
}

// Connexion ⇄ Créer un compte sans tout redessiner : la bulle glisse et les textes se fondent
function switchAuthMode(el, mode) {
  authMode = mode;
  const t = AUTH_TEXT[mode];
  const seg = el.querySelector('.seg');
  seg.classList.toggle('right', mode === 'signup');
  seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.auth === mode));
  el.querySelector('.auth-msg')?.remove();
  const pwd = el.querySelector('[name=password]');
  pwd.autocomplete = t.pwd;
  pwd.placeholder = t.ph;
  el.querySelector('[data-auth=forgot]').hidden = mode === 'signup';
  el.querySelectorAll('[data-t]').forEach(n => {
    n.classList.remove('auth-swap');
    void n.offsetWidth;
    n.textContent = t[n.dataset.t];
    n.classList.add('auth-swap');
  });
}

function hideAuth() {
  const el = document.getElementById('auth');
  if (el) el.remove();
  if (!document.getElementById('onboarding')) document.body.classList.remove('ob-open');
}

function onAuthClick(e) {
  const b = e.target.closest('[data-auth]');
  if (!b) return;
  const m = b.dataset.auth;
  if (m === 'guest') {
    localStorage.setItem(GUEST_KEY, '1');
    hideAuth();
    afterAuthFlow();
  } else if ((m === 'login' || m === 'signup') && authMode !== 'forgot' && e.currentTarget.querySelector('.seg')) {
    if (m !== authMode) switchAuthMode(e.currentTarget, m);
  } else showAuth(m);
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const email = String(f.get('email') || '').trim();
  const password = String(f.get('password') || '');
  const btn = e.target.querySelector('[type=submit]');
  if (authMode !== 'reset' && !/^\S+@\S+\.\S+$/.test(email)) return showAuth(authMode, 'Adresse e-mail invalide');
  if (authMode !== 'forgot' && password.length < 8) return showAuth(authMode, 'Le mot de passe doit faire au moins 8 caractères');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    if (authMode === 'reset') {
      const who = await setNewPassword(password);
      hideAuth();
      afterAuthFlow();
      return toast(`Mot de passe changé ✓ Connecté : ${who}`);
    }
    if (authMode === 'forgot') {
      await resetPassword(email);
      return showAuth('login', `E-mail envoyé à ${email}. Ouvre le lien reçu pour choisir un nouveau mot de passe, puis connecte-toi ici avec.`);
    }
    if (authMode === 'signup') {
      const r = await signUp(email, password);
      if (r === 'confirm') return showAuth('login', 'Compte créé ! Confirme ton e-mail avec le lien reçu, puis connecte-toi ici.');
    } else {
      await signIn(email, password);
    }
    hideAuth();
    afterAuthFlow();
    toast(`Connecté : ${email}`);
  } catch (err) {
    showAuth(authMode, navigator.onLine ? err.message : 'Pas de connexion internet');
  }
}

// Suite après connexion (ou choix sans compte) : questionnaire si l'app n'est pas encore configurée
function afterAuthFlow() {
  state.tab = 'week';
  render();
  fetchStepsFromGist(true);
  if (!data.settings.onboarded) startOnboarding();
}
