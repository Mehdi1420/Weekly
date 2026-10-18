// Envoie une notification aux abonnés (appelé par les workflows « Rappel pesée » et « Préparer la semaine »)
//
// Deux sources d'abonnements, cumulables :
// - automatique : chaque utilisateur connecté qui a touché « Activer les notifications » dans l'app
//   (son abonnement est synchronisé avec son compte) ; nécessite le secret SUPABASE_SECRET_KEY,
//   à ajouter UNE fois par le propriétaire du dépôt ;
// - manuelle (ancienne méthode) : le secret PUSH_CONFIG copié depuis l'app.
import webpush from 'web-push';
import { readFileSync } from 'node:fs';

// GitHub ne connaît que l'heure UTC : le workflow tourne à deux heures possibles et on n'envoie
// qu'à la bonne heure de Paris (été comme hiver).
const onlyAt = process.env.PUSH_ONLY_AT_PARIS_HOUR;
if (onlyAt) {
  const hour = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (hour !== +onlyAt) { console.log(`Il est ${hour} h à Paris, pas ${onlyAt} h : rien à envoyer.`); process.exit(0); }
}

const parse = s => { try { const c = typeof s === 'string' ? JSON.parse(s) : s; return c && c.subscription && c.vapidPrivateKey ? c : null; } catch { return null; } };
const targets = [];

if (process.env.PUSH_CONFIG) {
  const c = parse(process.env.PUSH_CONFIG);
  if (c) targets.push({ who: 'PUSH_CONFIG', ...c });
  else console.log('::warning::PUSH_CONFIG illisible, ignoré.');
}

const secret = process.env.SUPABASE_SECRET_KEY;
if (secret) {
  // L'adresse du projet est publique : on la lit dans config.js
  const url = (readFileSync('config.js', 'utf8').match(/supabaseUrl:\s*'([^']+)'/) || [])[1];
  if (!url) { console.error('supabaseUrl introuvable dans config.js'); process.exit(1); }
  const res = await fetch(`${url}/rest/v1/user_data?select=user_id,push:data->settings->>pushSub&data->settings->>pushSub=not.is.null`, {
    headers: { apikey: secret, Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) { console.error('Lecture des abonnements impossible', res.status, await res.text()); process.exit(1); }
  for (const row of await res.json()) {
    const c = parse(row.push);
    if (c) targets.push({ who: `compte ${row.user_id.slice(0, 8)}`, ...c });
  }
}

// Un même téléphone peut être à la fois dans PUSH_CONFIG et sur son compte : un seul envoi
const seen = new Set();
const unique = targets.filter(t => { const k = t.subscription.endpoint; if (seen.has(k)) return false; seen.add(k); return true; });

if (!unique.length) {
  console.log('::notice::Aucun abonné aux notifications pour l\'instant : rien à envoyer.');
  process.exit(0);
}

const payload = JSON.stringify({
  // iOS ajoute déjà « from Weekly » sous le titre : le message sert de titre, sans répéter le nom de l'app
  title: process.env.PUSH_BODY || 'Pesée du dimanche ⚖️',
  body: '',
  url: process.env.PUSH_URL || './?pesee=1',
});

let ok = 0;
for (const t of unique) {
  try {
    const r = await webpush.sendNotification(t.subscription, payload, {
      TTL: 12 * 3600,
      vapidDetails: { subject: 'mailto:weekly@example.com', publicKey: t.vapidPublicKey, privateKey: t.vapidPrivateKey },
    });
    ok++;
    console.log(`Notification envoyée (${t.who})`, r.statusCode);
  } catch (e) {
    const gone = e.statusCode === 404 || e.statusCode === 410;
    console.log(`::warning::Échec (${t.who}) ${e.statusCode || ''} ${gone ? ': abonnement expiré, il faut réactiver les notifications dans l\'app' : (e.body || e.message)}`);
  }
}
console.log(`${ok}/${unique.length} notification(s) envoyée(s).`);
// Échec du workflow seulement si plus rien ne passe (un abonné expiré ne doit pas bloquer les autres)
if (!ok) process.exit(1);
