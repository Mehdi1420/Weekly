// Cache hors-ligne. Incrémenter VERSION à chaque mise à jour de l'app.
const VERSION = 'v10';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'foods.js', 'brain.js', 'goals.js', 'onboarding.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

// Rappel de pesée du dimanche, envoyé par la GitHub Action « Rappel pesée »
self.addEventListener('push', e => {
  let msg = { title: 'Ma Semaine', body: "C'est dimanche : pense à te peser ⚖️" };
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
