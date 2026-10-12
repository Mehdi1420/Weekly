// Envoie le rappel de pesée à l'iPhone (appelé par .github/workflows/rappel-pesee.yml)
import webpush from 'web-push';

// PUSH_CONFIG : le code copié depuis l'app (Réglages → Activer les notifications)
if (!process.env.PUSH_CONFIG) {
  console.error('Secret manquant : PUSH_CONFIG (voir le README).');
  process.exit(1);
}
const { subscription, vapidPublicKey, vapidPrivateKey } = JSON.parse(process.env.PUSH_CONFIG);

webpush.setVapidDetails('mailto:ma-semaine@example.com', vapidPublicKey, vapidPrivateKey);
const payload = JSON.stringify({
  title: 'Ma Semaine',
  body: process.env.PUSH_BODY || "C'est dimanche : pense à te peser ⚖️",
  url: './?pesee=1',
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
