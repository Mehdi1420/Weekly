# Ma Semaine

Application iPhone personnelle pour organiser mon emploi du temps, choisir mes activités de la semaine et suivre ma forme.

C'est une web app installable (PWA) : elle s'ajoute à l'écran d'accueil, s'ouvre en plein écran et fonctionne hors connexion. Les données restent sur le téléphone (stockage local).

## Fonctionnalités (v0.9)

**Personnalisée pour chaque utilisateur.** Au premier lancement, un questionnaire de bienvenue configure l'app : prénom, modules utiles, **ta semaine décrite librement en quelques phrases** (travail, alternance, cours, horaires, sport, habitudes : analysée par l'IA Gemini si une clé est donnée, sinon par un analyseur intégré ; les activités régulières deviennent des routines bloquées dans le planning et les étapes suivantes sont pré-remplies) (études et projets, forme), rythme (statut, heure à partir de laquelle on est libre, coucher, début du week-end), sports pratiqués et nombre de séances visé, centres d'intérêt, objectifs perso (certification AWS ou autre, programmation, langue, lecture et genres préférés, instrument…), profil santé. L'app en déduit les idées d'activités, les projets, les plages horaires où elle propose des choses et les onglets affichés, puis continue d'apprendre des habitudes. Le questionnaire peut être refait dans Réglages, sans perdre de données.

- **Semaine** : vue du lundi au dimanche, ajout et modification d'activités, temps total par catégorie.
- **Apprentissage des habitudes** (tout est calculé sur le téléphone)
  - **Routines** : une activité peut se répéter (chaque semaine, en semaine, le week-end, tous les jours) et se crée toute seule les semaines suivantes. Modifier une occurrence demande si le changement vaut aussi pour les prochaines fois ; « Sauter cette fois » ou « Arrêter la routine ».
  - **Détection automatique** : une activité notée au moins 2 semaines le même jour (une semaine sur deux ou plus, sur les 8 dernières) est proposée comme routine, avec l'heure et la durée habituelles.
  - **✨ Proposer ma semaine** : remplit les soirées libres (18 h–23 h) et les week-ends (10 h–23 h) avec les idées qui collent le mieux à tes habitudes (jour, moment de la journée, heure habituelle) et à ce qui manque cette semaine (une catégorie habituelle pas encore faite). ✓ pour accepter, ✕ pour refuser ; les refus sont retenus.
  - **Carte « Aujourd'hui »** : en cours, à suivre, activités passées à cocher, et une idée pour le prochain créneau libre.
  - **Repas habituels** : dans l'onglet Forme, « Comme d'habitude » refait ton dernier repas du même type en un toucher, et les aliments que tu prends souvent s'ajoutent d'un toucher.
- **Objectifs**
  - **Cours et devoirs Moodle** importés automatiquement (lien d'export du calendrier, jamais d'identifiants) : cours dans le planning (catégorie Études), devoirs et QCM dans « À rendre » avec date limite, temps estimé, temps déjà passé et prévu.
  - **Sessions de travail planifiées** : le temps restant de chaque devoir est réparti sur les semaines avant l'échéance, en fin de journée en semaine et en journée le week-end.
  - **Projets perso** avec modèles : Certification AWS (10 étapes), Progresser en programmation (7 étapes), Lecture, ou projet libre. Temps visé par semaine, durée des sessions, étapes à cocher, échéance.
  - **Lecture** : livre en cours, page atteinte demandée après chaque session, vitesse de lecture apprise et date de fin estimée. Suggestions de livres selon tes projets (AWS, programmation), tes notes et ton niveau, et pour varier ; « Plus d'idées avec ChatGPT ».
  - **✨ Planifier mes sessions** : devoirs d'abord, puis projets, puis loisirs ; 2 activités max par soir de semaine (plus la lecture), 3 le week-end.
- **Activités** : banque d'idées, « Planifier », et « Propose-moi une activité » (tirage au sort).
- **Forme**
  - **Calories** : on tape ses repas comme on parle (« pâtes carbonara, 2 croissants et un coca », « grande assiette de riz poulet »). L'app découpe, reconnaît les plats (base intégrée de ~250 plats et aliments courants, portions habituelles) et additionne. Les quantités (« 2 », « deux ») et tailles (« petit », « grande ») sont prises en compte. Un plat inconnu se complète à la main et est retenu pour la suite, ou, avec la **recherche IA Gemini** (gratuite, voir plus bas), tout repas est analysé automatiquement par l'IA.
  - **Pas** : synchro automatique avec l'app Santé (automatisation iOS + gist secret), ou import manuel ; conversion en calories dépensées.
  - **Objectif du jour** : métabolisme de base (selon profil et dernière pesée) + pas, ajusté selon l'objectif (perdre / maintenir / prendre).
  - **Maintien calorique automatique** : recalculé à chaque pesée hebdomadaire à partir de ce que tu as réellement mangé et de l'évolution de ton poids sur les 4 dernières semaines (moyenne des kcal notées − variation du poids × 7 700 kcal/kg). Il remplace la formule théorique dans l'objectif du jour dès qu'il y a 2 pesées et 5 jours de repas notés, et devient « fiable » après 3 pesées et 2 semaines notées. Détail semaine par semaine.
  - **Poids** : une pesée par semaine, courbe d'évolution, rappel le dimanche par notification.
- **Réglages** : préférences, profil, notifications, pas, recherche IA, export / import.

## Installer sur l'iPhone

1. Publier le dépôt avec GitHub Pages (Settings → Pages → Deploy from a branch → `main`, dossier `/ (root)`).
2. Ouvrir `https://mehdi1420.github.io/test/` dans **Safari**.
3. Bouton Partager → **Sur l'écran d'accueil**. Ouvrir ensuite l'app depuis son icône.


### Mises à jour : rien à réinstaller

L'app installée se met à jour toute seule quand on l'ouvre (Réglages → **Vérifier les mises à jour** pour forcer).
**Ne pas supprimer l'icône de l'écran d'accueil** pour mettre à jour : iOS efface alors toutes les données de l'app (historique, réglages, clé Gemini).
Safari et l'app installée n'ont pas les mêmes données : toujours ouvrir l'app depuis son icône. Penser à **Exporter mes données** de temps en temps (la clé Gemini peut être incluse) ; **Importer une sauvegarde** restaure tout.
## Synchroniser les pas avec Santé (une seule fois)

Une web app ne peut pas lire l'app Santé directement : un raccourci iOS sert de passerelle. Deux modes possibles.

### Mode automatique (conseillé)

Une automatisation iPhone envoie tes pas plusieurs fois par jour dans une note privée GitHub (un « gist secret »), et l'app les récupère toute seule à chaque ouverture. Seuls les nombres de pas quittent le téléphone.

**1. Créer le gist secret** (sur l'iPhone dans Safari, ou sur un ordinateur)
- Aller sur **gist.github.com** (connecté à ton compte).
- Nom du fichier : `pas.txt` ; contenu : `0`.
- Choisir **Create secret gist**.
- Copier l'adresse de la page (du type `https://gist.github.com/Mehdi1420/a1b2c3…`).

**2. Créer une clé d'accès limitée aux gists**
- github.com → photo de profil → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**.
- Note : `Ma Semaine pas` ; expiration : **No expiration** (ou 1 an, à renouveler) ; cocher **uniquement `gist`**.
- **Generate token**, puis copier la clé (`ghp_…`). Elle ne s'affiche qu'une fois. Elle permet seulement de modifier tes gists, rien d'autre.

**3. Créer le raccourci `Pas Ma Semaine`** dans l'app **Raccourcis** :
1. **Rechercher des échantillons de santé** : Type = *Nombre de pas*, Date de début = *dans les 7 derniers jours*, Grouper par = *Jour*.
2. **Répéter avec chacun** (sur le résultat), et à l'intérieur :
   - **Formater la date** : *Date de début* de l'élément répété, format personnalisé `yyyy-MM-dd`.
   - **Texte** : `[Date formatée]: [Valeur]`.
3. Après la boucle : **Combiner le texte** (*Résultats de Répéter*, séparateur *Nouvelle ligne*).
4. **Obtenir le contenu de l'URL** :
   - URL : `https://api.github.com/gists/` suivi de l'identifiant du gist (la fin de son adresse, après ton nom).
   - Méthode : **PATCH**.
   - En-têtes : `Authorization` = `Bearer ghp_…` (ta clé) et `Accept` = `application/vnd.github+json`.
   - Corps de la requête : **JSON**, avec un champ `files` de type *Dictionnaire*, contenant un champ `pas.txt` de type *Dictionnaire*, contenant un champ `content` de type *Texte* = *Texte combiné*.

Lancer le raccourci une fois à la main et autoriser l'accès à Santé. Le gist doit maintenant contenir tes pas.

**4. Automatiser** : Raccourcis → onglet **Automatisation** → **+** → **Heure de la journée** → par ex. 9 h, *Quotidiennement* → **Exécuter immédiatement** → raccourci *Pas Ma Semaine*. Répéter pour quelques heures dans la journée (par ex. 13 h, 19 h, 23 h) pour que les pas restent à jour.

**5. Dans l'app** : Réglages → **Activer la synchro automatique** → coller l'adresse du gist. L'onglet Forme affiche « 🔄 Synchro auto · données envoyées il y a … ».

Le bouton **Synchroniser avec Santé** lance aussi le raccourci à la demande : en revenant dans l'app, les pas sont relus immédiatement.

### Mode manuel (sans GitHub)

Même raccourci, mais en remplaçant l'étape 4 par **Copier dans le presse-papiers**. Dans l'app : **Synchroniser avec Santé**, revenir dans l'app (lien « ◀ » en haut à gauche) et toucher **Coller les pas importés**. Un simple nombre collé ou saisi (**Saisir**) fonctionne aussi.

## Importer les cours et devoirs Moodle (une seule fois)

Pré-requis : la synchro automatique des pas (gist secret + clé `gist`) doit être en place, les cours passent par le même gist.

1. Sur Moodle : **Calendrier** → **Importer ou exporter des calendriers** → **Exporter le calendrier**. Choisir « Tous les cours » et « Événements récents et à venir », puis **Obtenir l'adresse URL du calendrier** et la copier. Ce lien contient une clé privée : ne le partage pas.
2. Dans le dépôt GitHub : Settings → Secrets and variables → Actions → **New repository secret**, trois fois :
   - `MOODLE_ICS_URL` : le lien Moodle. Un emploi du temps au format iCal (ADE, Hyperplanning…) peut être ajouté sur une 2e ligne.
   - `GIST_ID` : la fin de l'adresse du gist (après ton nom).
   - `GIST_TOKEN` : la clé `ghp_…` limitée aux gists.
3. Onglet **Actions** → **Import calendrier** → **Run workflow**. Ensuite l'import tourne toutes les 3 heures et l'app se met à jour à l'ouverture.

Sans GitHub : Objectifs → Connecter Moodle → **importer un fichier .ics** téléchargé depuis Moodle.

Les devoirs importés gardent ton temps estimé, tes notes et leur état « terminé » d'un import à l'autre. Un devoir supprimé dans l'app est masqué (il ne revient pas).

## Rappel de pesée du dimanche (une seule fois)

Une GitHub Action (`.github/workflows/rappel-pesee.yml`) envoie chaque dimanche vers 9 h une notification à l'iPhone. Toucher la notification ouvre directement la saisie du poids.

1. Le workflow doit être sur la branche `main` (les tâches planifiées ne tournent que sur la branche par défaut).
2. Dans l'app installée : Réglages → **Activer les notifications** → accepter → **Copier le code**. L'app génère elle-même ses clés de notification ; ce code est personnel.
3. Dans le dépôt GitHub : Settings → Secrets and variables → Actions → **New repository secret**, nom `PUSH_CONFIG`, valeur = le code copié.
4. Tester : onglet Actions → *Rappel pesée* → **Run workflow**.

Si l'app est réinstallée, refaire les étapes 2–3. Sans activité sur le dépôt pendant 60 jours, GitHub suspend les tâches planifiées : il suffit de les réactiver dans l'onglet Actions.

## Recherche IA automatique des calories (Gemini, gratuit)

Avec une clé Google Gemini, chaque repas tapé (« un bibimbap et du kimchi », « grande assiette de pâtes carbonara ») est analysé directement par l'IA : découpage en aliments, portions, calories. Rien à copier ni à coller.

1. Ouvrir **aistudio.google.com/apikey** avec un compte Google → **Create API key** → copier la clé (`AIza…`).
2. Dans l'app : Réglages → **Recherche IA** → *Gemini (automatique, gratuit)* → coller la clé → OK (elle est vérifiée). Elle peut aussi être donnée dans le questionnaire de bienvenue.

- L'app choisit toute seule le modèle Gemini « flash » le plus récent disponible pour la clé.
- Un repas déjà analysé est repris du cache, sans nouvel appel.
- Hors connexion, limite gratuite atteinte ou erreur : la base intégrée prend le relais et l'app le signale.
- La clé reste sur le téléphone et n'est pas incluse dans les sauvegardes exportées.
- Avec l'offre gratuite, Google peut utiliser les textes envoyés (ici, la description des repas) pour améliorer ses services.

### Alternative : ChatGPT avec l'abonnement (manuel)

L'abonnement ChatGPT ne donne pas accès à l'API d'OpenAI (payante à part). Les modes *ChatGPT via le raccourci* et *ChatGPT via le site* passent par l'app ChatGPT : il faut revenir dans l'app et toucher **Coller la réponse de ChatGPT**. Raccourci `Calories ChatGPT` : entrée du raccourci en **Texte** → **Demander à ChatGPT** (message = *Entrée du raccourci*, *Ouvrir dans l'app* désactivé) → **Copier dans le presse-papiers**.

## Développement

Aucun outil de build : HTML, CSS et JavaScript simples.

```sh
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
```

À chaque mise à jour, incrémenter `VERSION` dans `sw.js` pour que l'iPhone récupère la nouvelle version.
