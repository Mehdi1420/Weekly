// Envoie une notification à l'iPhone (appelé par les workflows « Rappel pesée » et « Préparer la semaine »)
import webpush from 'web-push';

// PUSH_CONFIG : le code copié depuis l'app (Réglages → Activer les notifications)
if (!process.env.PUSH_CONFIG) {
  console.error('Secret manquant : PUSH_CONFIG (voir le README).');
  process.exit(1);
}
const { subscription, vapidPublicKey, vapidPrivateKey } = JSON.parse(process.env.PUSH_CONFIG);

// GitHub ne connaît que l'heure UTC : le workflow tourne à deux heures possibles et on n'envoie
// qu'à la bonne heure de Paris (été comme hiver).
const onlyAt = process.env.PUSH_ONLY_AT_PARIS_HOUR;
if (onlyAt) {
  const hour = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (hour !== +onlyAt) { console.log(`Il est ${hour} h à Paris, pas ${onlyAt} h : rien à envoyer.`); process.exit(0); }
}

webpush.setVapidDetails('mailto:ma-semaine@example.com', vapidPublicKey, vapidPrivateKey);
const payload = JSON.stringify({
  title: 'Weekly',
  body: process.env.PUSH_BODY || "C'est dimanche : pense à te peser ⚖️",
  url: process.env.PUSH_URL || './?pesee=1',
});

try {
  const res = await webpush.sendNotification(subscription, payload, { TTL: 12 * 3600 });
  console.log('Notification envoyée', res.statusCode);
} catch (e) {
  console.error('Échec', e.statusCode, e.body || e.message);
  if (e.statusCode === 404 || e.statusCode === 410) {
    console.error("L'abonnement a expiré : réactive les notifications dans l'app et mets à jour PUSH_CONFIG.");
  }
  process.exit(1);
}
