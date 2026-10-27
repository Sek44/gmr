# GMR — petits jeux pour enfants

Site statique sans étape de build, conçu pour GitHub Pages, téléphone, tablette et ordinateur. Certains jeux chargent une librairie JavaScript dans le navigateur (GCV utilise Three.js depuis un CDN).

## Organisation

- index.html : accueil, cartes construites depuis games/catalog.js.
- scores.html : historique global et par jeu, courbe d'évolution sur les pages de jeu.
- games/<id>/ : chaque jeu (HTML, JS, CSS ou ressources propres).
- games/gcv/ : **Grande Course Voiture**, essais libres et courses de 3 tours contre 9 concurrents. Voir [les règles actuelles](games/gcv/SPECIFICATIONS.md) et [l'historique](games/gcv/CHANGELOG.md).
- games/_template/ : modèle de nouveau jeu, non inscrit à l'accueil.
- shared/site.css : composants visuels responsives communs.
- shared/game-state.js : états des parties, restauration et sauvegarde automatique.
- shared/scores.js : scores avec historique, courbe et suppression confirmée.
- shared/score-view.js : ouverture des scores en conservant le jeu courant.
- shared/app-confirm.js : fenêtres de confirmation dans l'application.
- shared/game-ui.js : pavé numérique et utilitaires d'interface réutilisables.
- shared/home.js et shared/scores-page.js : affichage des pages générales.
- tests/ : tests Node.js sans dépendance.

Ces modules ont été sélectionnés et adaptés des éléments communs de Sek44/xfr1.
Les jeux de xfr1 et leurs données ne sont pas copiés.

## Ajouter un jeu

Copier games/_template vers games/<id>, adapter game.js et index.html puis
ajouter le jeu dans games/catalog.js. L'accueil détecte automatiquement les
jeux du catalogue et affiche « Reprendre » si une sauvegarde existe.

Chaque jeu appelle GameState.create(id).bind({ snapshot, restore }) pour
restaurer les données locales, puis changed() après les actions modifiant
la partie. Les événements pagehide et visibilitychange sont gérés par
le module partagé. À la fin, stop({ discard: true }) efface la partie en
cours et GameScores.save({ gameId: id, score, total }) conserve son résultat.

Un jeu qui utilise le lien scores.html peut appeler ScoreView.bind({
  suspend() { /* mettre en pause les animations et sauvegarder */ },
  resume() { /* reprendre le jeu */ }
}) afin de conserver sa session en affichant les scores.

## Enregistrement local

Toutes les données restent dans localStorage sur le navigateur et l'appareil
utilisés. Elles ne sont pas synchronisées entre appareils. L'historique de
xfr1 demeure indépendant : GMR utilise les clés gmr:v1:scores et
gmr:v1:state:<id>. Éviter de changer ces clés sans migration explicite.

## Vérifications

Node.js : node --test tests/*.test.cjs

GCV inclut les tests de physique dans tests/gcv-physics.test.cjs.
Le rendu WebGL et le plein écran restent à vérifier manuellement sur Chrome Android.

À chaque modification incompatible de GCV, augmenter les deux champs de révision de session
indiqués dans `AGENTS.md`. Les courses et essais précédents sont alors annulés ;
**les scores et les meilleurs tours restent conservés**.

Le test de navigation et d'affichage doit aussi être fait sur téléphone et
tablette. La publication GitHub Pages peut se faire directement depuis la
branche main, répertoire racine. URL prévue : https://sek44.github.io/gmr/.
