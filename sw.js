// Cache hors-ligne. Incrémenter VERSION à chaque mise à jour de l'app.
const VERSION = 'v48';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'cloud.js', 'foods.js', 'brain.js', 'goals.js', 'onboarding.js', 'life.js', 'agenda.js', 'media.js', 'update.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload' : on prend les fichiers sur le serveur, jamais dans le cache du navigateur (sinon versions mélangées)
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Réseau d'abord (pour recevoir les mises à jour), cache si hors connexion
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    // no-cache : le navigateur revérifie toujours auprès du serveur (GitHub Pages garde sinon les fichiers 10 min)
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then(res => {
        // Une erreur serveur (404…) ne doit jamais écraser la version en cache
        if (!res.ok) return caches.match(e.request).then(r => r || res);
        const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

// Notifications du dimanche (pesée le matin, préparation de la semaine à 17 h), envoyées par les GitHub Actions
self.addEventListener('push', e => {
  let msg = { title: 'Weekly', body: "C'est dimanche : pense à te peser ⚖️" };
  try { if (e.data) msg = { ...msg, ...e.data.json() }; } catch { /* texte brut */ }
  e.waitUntil(self.registration.showNotification(msg.title, { body: msg.body, icon: 'icons/icon-192.png', data: { url: msg.url || './?pesee=1' } }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    const win = list[0];
    return win ? win.navigate(url).then(w => (w || win).focus()) : self.clients.openWindow(url);
  }));
});
