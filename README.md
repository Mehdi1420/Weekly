# Ma Semaine

Application iPhone personnelle pour organiser mon emploi du temps, choisir mes activités de la semaine et suivre ma forme.

C'est une web app installable (PWA) : elle s'ajoute à l'écran d'accueil, s'ouvre en plein écran et fonctionne hors connexion. Les données restent sur le téléphone (stockage local).

## Fonctionnalités (v0.2)

- **Semaine** : vue du lundi au dimanche, ajout et modification d'activités, temps total par catégorie.
- **Activités** : banque d'idées, « Planifier », et « Propose-moi une activité » (tirage au sort).
- **Forme**
  - **Calories** : on tape ses repas comme on parle (« pâtes carbonara, 2 croissants et un coca », « grande assiette de riz poulet »). L'app découpe, reconnaît les plats (base intégrée de ~250 plats et aliments courants, portions habituelles) et additionne. Les quantités (« 2 », « deux ») et tailles (« petit », « grande ») sont prises en compte. Un plat inconnu se complète à la main et est retenu pour la suite, ou peut être confié à **ChatGPT avec ton abonnement** (optionnel, voir plus bas).
  - **Pas** : import depuis l'app Santé via un raccourci iOS, conversion en calories dépensées.
  - **Objectif du jour** : métabolisme de base (selon profil et dernière pesée) + pas, ajusté selon l'objectif (perdre / maintenir / prendre).
  - **Poids** : une pesée par semaine, courbe d'évolution, rappel le dimanche par notification.
- **Réglages** : profil, notifications, ChatGPT, export / import.

## Installer sur l'iPhone

1. Publier le dépôt avec GitHub Pages (Settings → Pages → Deploy from a branch → `main`, dossier `/ (root)`).
2. Ouvrir `https://mehdi1420.github.io/test/` dans **Safari**.
3. Bouton Partager → **Sur l'écran d'accueil**. Ouvrir ensuite l'app depuis son icône.

## Synchroniser les pas avec Santé (une seule fois)

Une web app ne peut pas lire l'app Santé directement : un raccourci iOS sert de passerelle.

Dans l'app **Raccourcis**, créer un raccourci nommé exactement **`Pas Ma Semaine`** avec ces actions :

1. **Rechercher des échantillons de santé** : Type = *Nombre de pas*, Date de début = *dans les 7 derniers jours*, Grouper par = *Jour*.
2. **Répéter avec chacun** (sur le résultat), et à l'intérieur :
   - **Formater la date** : *Date de début* de l'élément répété, format personnalisé `yyyy-MM-dd`.
   - **Texte** : `[Date formatée]: [Valeur]` (deux variables séparées par « : »).
3. Après la boucle : **Combiner le texte** (*Résultats de Répéter*, séparateur *Nouvelle ligne*).
4. **Copier dans le presse-papiers**.

À la première exécution, autoriser l'accès à Santé.

Utilisation : onglet Forme → **Synchroniser avec Santé**. Le raccourci s'exécute ; revenir dans l'app (lien « ◀ » en haut à gauche) et toucher **Coller les pas importés**. Les 7 derniers jours sont mis à jour d'un coup. Un simple nombre collé ou saisi fonctionne aussi.

## Rappel de pesée du dimanche (une seule fois)

Une GitHub Action (`.github/workflows/rappel-pesee.yml`) envoie chaque dimanche vers 9 h une notification à l'iPhone. Toucher la notification ouvre directement la saisie du poids.

1. Le workflow doit être sur la branche `main` (les tâches planifiées ne tournent que sur la branche par défaut).
2. Dans l'app installée : Réglages → **Activer les notifications** → accepter → **Copier le code**. L'app génère elle-même ses clés de notification ; ce code est personnel.
3. Dans le dépôt GitHub : Settings → Secrets and variables → Actions → **New repository secret**, nom `PUSH_CONFIG`, valeur = le code copié.
4. Tester : onglet Actions → *Rappel pesée* → **Run workflow**.

Si l'app est réinstallée, refaire les étapes 2–3. Sans activité sur le dépôt pendant 60 jours, GitHub suspend les tâches planifiées : il suffit de les réactiver dans l'onglet Actions.

## ChatGPT pour les plats inconnus (optionnel, avec l'abonnement)

L'abonnement ChatGPT (Plus) ne donne pas accès à l'API d'OpenAI, qui est payante à part. L'app passe donc par **l'app ChatGPT** : c'est ton abonnement qui est utilisé, sans frais en plus.

Fonctionnement : quand la base intégrée ne reconnaît pas un plat (ou avec le bouton **Demander à ChatGPT**), l'app envoie la question à ChatGPT. Copie la réponse si besoin, reviens dans l'app et touche **Coller la réponse de ChatGPT**. Les plats et leurs calories sont ajoutés automatiquement.

À choisir dans Réglages → **ChatGPT** :

- **Via le raccourci** (conseillé, plus rapide). Dans l'app **Raccourcis**, créer un raccourci nommé exactement **`Calories ChatGPT`** :
  1. Dans les détails du raccourci (ⓘ), vérifier que l'entrée du raccourci accepte du **Texte**.
  2. Action **Demander à ChatGPT** (fournie par l'app ChatGPT, connectée à ton compte) : message = *Entrée du raccourci*. Désactiver *Ouvrir dans l'app* pour récupérer la réponse directement.
  3. Action **Copier dans le presse-papiers** (*Réponse*).
- **Via le site** : ouvre chatgpt.com avec la question déjà écrite. Copier la réponse, puis revenir dans l'app.

ChatGPT répond au format `nom | portion | kcal` ; l'app comprend aussi un tableau ou une liste. Si la réponse n'est pas reconnue, **Base intégrée** utilise l'estimation locale à la place.

## Développement

Aucun outil de build : HTML, CSS et JavaScript simples.

```sh
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
```

À chaque mise à jour, incrémenter `VERSION` dans `sw.js` pour que l'iPhone récupère la nouvelle version.
