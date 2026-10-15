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

async function resetPassword(email) {
  await supa('/auth/v1/recover', { method: 'POST', body: { email } });
}

async function deleteCloudData() {
  const s = await validSession();
  if (!s) return;
  await supa(`/rest/v1/user_data?user_id=eq.${s.user.id}`, { method: 'DELETE', token: s.access_token });
}

// ---------- Écran de connexion ----------

let authMode = 'login';

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
  const signup = mode === 'signup';
  const forgot = mode === 'forgot';
  el.innerHTML = `
    <form class="ob-inner auth-inner" novalidate>
      <div class="ob-body">
        <img class="auth-logo" src="icons/icon-192.png" alt="">
        <h1>${forgot ? 'Mot de passe oublié' : signup ? 'Créer ton compte' : 'Weekly'}</h1>
        <p class="ob-lead">${forgot ? 'Tu vas recevoir un e-mail pour choisir un nouveau mot de passe.'
          : signup ? 'Tes données seront liées à ton compte et retrouvées sur tous tes appareils.'
          : 'Connecte-toi pour retrouver tes données sur tous tes appareils.'}</p>
        ${!forgot ? `<div class="seg"><button type="button" data-auth="login" class="${!signup ? 'on' : ''}">Connexion</button><button type="button" data-auth="signup" class="${signup ? 'on' : ''}">Créer un compte</button></div>` : ''}
        <div class="field">
          <label>E-mail <input type="email" name="email" autocomplete="email" inputmode="email" required></label>
          ${forgot ? '' : `<label>Mot de passe <input type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="8" required placeholder="${signup ? '8 caractères minimum' : ''}"></label>`}
        </div>
        ${message ? `<p class="auth-msg">${esc(message)}</p>` : ''}
        <button type="submit" class="primary">${forgot ? 'Envoyer l\'e-mail' : signup ? 'Créer mon compte' : 'Se connecter'}</button>
        ${forgot ? '<button type="button" class="text-btn auth-link" data-auth="login">← Retour à la connexion</button>'
          : signup ? '' : '<button type="button" class="text-btn auth-link" data-auth="forgot">Mot de passe oublié ?</button>'}
        ${getSession() ? '' : '<button type="button" class="text-btn auth-link muted" data-auth="guest">Continuer sans compte</button>'}
      </div>
    </form>`;
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
  } else showAuth(m);
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const email = String(f.get('email') || '').trim();
  const password = String(f.get('password') || '');
  const btn = e.target.querySelector('[type=submit]');
  if (!/^\S+@\S+\.\S+$/.test(email)) return showAuth(authMode, 'Adresse e-mail invalide');
  if (authMode !== 'forgot' && password.length < 8) return showAuth(authMode, 'Le mot de passe doit faire au moins 8 caractères');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    if (authMode === 'forgot') {
      await resetPassword(email);
      return showAuth('login', 'E-mail envoyé. Choisis un nouveau mot de passe via le lien, puis reviens te connecter ici.');
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
