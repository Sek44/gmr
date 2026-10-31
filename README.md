# GMR — petits jeux pour enfants

Site statique sans étape de build, conçu pour GitHub Pages, téléphone, tablette et ordinateur. Certains jeux chargent une librairie JavaScript dans le navigateur (GCV utilise Three.js depuis un CDN).

## Organisation

- `index.html` : accueil, cartes construites depuis `games/catalog.js`.
- `scores.html` : historique global et par jeu, courbe d'évolution sur les pages de jeu.
- `games/<id>/` : chaque jeu (HTML, JS, CSS ou ressources propres), avec sa documentation dans `docs/`.
- `games/gcv/` : **Grande Course Voiture**, essais libres et courses de 3 tours contre 9 concurrents. Voir [ses spécifications](games/gcv/docs/SPECIFICATIONS.md), [son architecture](games/gcv/docs/ARCHITECTURE.md) et [son backlog](games/gcv/docs/BACKLOG.md).
- `games/_template/` : modèle de jeu et de documentation, non inscrit à l'accueil.
- `shared/site.css` : composants visuels responsives communs.
- `shared/game-state.js` : sauvegarde et restauration des sessions.
- `shared/scores.js` : scores avec historique, courbe et suppression confirmée.
- `shared/score-view.js` : ouverture des scores en conservant le jeu courant (pour les jeux qui l'utilisent).
- `shared/app-confirm.js` : fenêtres de confirmation dans l'application.
- `shared/game-ui.js` : éléments d'interface réutilisables.
- `shared/home.js` et `shared/scores-page.js` : affichage des pages générales.
- `docs/` : [documentation transversale et règles de maintenance](docs/README.md), [architecture globale](docs/ARCHITECTURE.md) et [backlog global](docs/BACKLOG.md).
- `tests/` : tests Node.js sans dépendance.

Ces modules ont été sélectionnés et adaptés des éléments communs de Sek44/xfr1. Les jeux de xfr1 et leurs données ne sont pas copiés.

## Ajouter un jeu

Copier `games/_template` vers `games/<id>`, adapter `game.js`, `index.html` et `docs/`, puis ajouter le jeu dans `games/catalog.js`. L'accueil détecte automatiquement les jeux du catalogue et affiche « Reprendre » si une sauvegarde existe.

Chaque jeu appelle `GameState.create(id).bind({ snapshot, restore })` pour restaurer les données locales, puis `changed()` après les actions modifiant la partie. Les événements `pagehide` et `visibilitychange` sont gérés par le module partagé. À la fin, `stop({ discard: true })` efface la partie en cours et `GameScores.save({ gameId: id, score, total })` conserve son résultat.

Un jeu qui utilise le lien `scores.html` peut appeler `ScoreView.bind({ suspend() { /* sauvegarder / mettre en pause */ }, resume() { /* reprendre */ } })` afin de préserver la session lors de la consultation des scores. GCV a actuellement une navigation dédiée.

## Enregistrement local

Toutes les données restent dans `localStorage` sur le navigateur et l'appareil utilisés, sans synchronisation. GMR utilise les clés `gmr:v1:scores` et `gmr:v1:state:<id>` ; les records propres à certains jeux sont conservés séparément. Ne pas toucher à l'espace de données de xfr1.

Les sessions GCV d'une version incompatible peuvent être annulées lors d'une mise à jour ; les records et historiques de scores compatibles ne sont pas effacés. Voir [AGENTS.md](AGENTS.md).

## Vérifications et publication

Commande de tests Node.js : `node --test tests/*.test.cjs`.

Le rendu WebGL et le plein écran nécessitent encore une validation manuelle sur Chrome Android. Vérifier également la navigation et les contrôles tactiles sur téléphone et tablette. GitHub Actions lance les tests sur `main` et les pull requests.

La publication GitHub Pages est prévue depuis la branche `main`, répertoire racine : https://sek44.github.io/gmr/.

## Temps de jeu quotidien

Les exercices du site xfr1 donnent un crédit quotidien (actuellement 10 minutes par exercice). GMR lit `entrainement_daily_exercises_v1` et conserve séparément le temps consommé dans `gmr:v1:daily-play-time`. Le quota est commun à tous les jeux GMR, ne décompte que les parties actives et visibles, bloque le jeu à épuisement et repart à zéro à chaque date locale. Le partage xfr1/GMR exige une même origine web ; il ne traverse ni les navigateurs ni les appareils.
