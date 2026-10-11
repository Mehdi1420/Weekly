# Ma Semaine

Application iPhone personnelle pour organiser mon emploi du temps et choisir mes activités de la semaine.

C'est une web app installable (PWA) : elle s'ajoute à l'écran d'accueil, s'ouvre en plein écran et fonctionne hors connexion. Les données restent sur le téléphone (stockage local du navigateur).

## Fonctionnalités (v0.1)

- **Semaine** : vue du lundi au dimanche, navigation entre les semaines, ajout et modification d'activités (horaires, catégorie, notes, « fait »), temps total par catégorie.
- **Activités** : banque d'idées classées par catégorie, bouton « Planifier » pour les placer dans la semaine, et « Propose-moi une activité » pour un tirage au sort parmi celles pas encore prévues.
- **Réglages** : export et import d'une sauvegarde JSON.

## Installer sur l'iPhone

1. Publier le dépôt avec GitHub Pages (Settings → Pages → Deploy from a branch → choisir la branche, dossier `/ (root)`).
2. Ouvrir l'adresse `https://<utilisateur>.github.io/<dépôt>/` dans **Safari**.
3. Bouton Partager → **Sur l'écran d'accueil**.

## Développement

Aucun outil de build : HTML, CSS et JavaScript simples.

```sh
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
```

À chaque mise à jour, incrémenter `VERSION` dans `sw.js` pour que l'iPhone récupère la nouvelle version.
