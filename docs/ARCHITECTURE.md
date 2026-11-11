# GMR — Architecture actuelle

## Contexte et contraintes

GMR est un monorepo de petits jeux jouables directement dans le navigateur, publié comme site **statique** sur GitHub Pages (`/gmr/`). Le projet utilise HTML, CSS et JavaScript sans serveur applicatif ni compilation obligatoire. Les interfaces visent le tactile sur téléphone/tablette, en portrait et paysage, ainsi que le clavier sur ordinateur lorsque le jeu le prévoit.

## Points d'entrée

- `index.html` charge la page d'accueil ; `games/catalog.js` contient la liste explicite des jeux publiés, avec leur identifiant et leur `saveRevision` éventuelle.
- `scores.html` affiche les résultats et records à partir des services communs.
- `games/<id>/index.html` est la page autonome d'un jeu ; les ressources partagées sont référencées par des chemins relatifs pour fonctionner sous GitHub Pages.
- `games/_template/` fournit une base pour créer un jeu sans l'inscrire automatiquement au catalogue.

## Modules partagés

| Module | Responsabilité |
| --- | --- |
| `shared/home.js` | Construction du catalogue à partir de `games/catalog.js` |
| `shared/site.css` et `shared/styles/` | Entrée CSS stable ; styles indépendants de base, composants, accueil, scores et temps de jeu |
| `games/<id>/game.css` | Présentation spécifique au jeu (scène, HUD, commandes, animations), hors couche commune |
| `shared/game-state.js` (`GameState`) | Sauvegarder et restaurer une session par jeu ; enregistrer également lors de `pagehide` et du masquage de l'onglet |
| `shared/scores.js` (`GameScores`) | Historique général des scores, affichage, courbes et suppression ciblée ; enregistrement des adaptateurs de vues par jeu |
| `shared/scores-page.js` | Entrée de la page de consultation des scores |
| `shared/score-view.js` (`ScoreView`) | Afficher les scores dans une iframe en suspendant/reprenant le jeu qui utilise ce service |
| `shared/app-confirm.js` (`AppConfirm`) | Dialogues de confirmation |
| `shared/game-ui.js` (`GameUI`) | Composants d'interface réutilisables, dont le pavé numérique |
| `shared/play-time.js` (`GmrPlayTime`) | Lecture du crédit xfr1, temps de jeu partagé, affichage et verrouillage |

Le mode d'affichage des scores de GCV dispose encore de sa propre navigation/iframe ; l'unification avec `ScoreView` est dans le [backlog global](BACKLOG.md). Le rendu des records chronométriques appartient maintenant à `games/gcv/scores-adapter.js`, enregistré par `GameScores.registerRenderer("gcv", render)` ; `games/catalog.js` déclare les scripts de chaque adaptateur dans `scoreScripts` ; `shared/scores-page.js` les charge en ordre après le service commun, avant d'afficher les résultats. Les autres jeux peuvent enregistrer leur propre vue sans introduire d'import de jeu dans `shared/scores.js`.

## Stockage et données

Le stockage s'effectue localement via `localStorage`, sans comptes ni synchronisation entre appareils :

- `gmr:v1:state:<id>` : session en cours, gérée par `GameState` ;
- `gmr:v1:scores` : historique commun, géré par `GameScores` ;
- `gmr:v1:daily-play-time` : consommation globale du jour `{version, date, elapsedMs}` ;
- les jeux peuvent conserver d'autres données pérennes spécifiques, documentées dans leur architecture.

`shared/play-time.js` lit la clé xfr1 **sans jamais la modifier** : `entrainement_daily_exercises_v1`, version 1, avec date locale, secondes exactes facultatives et minutes entières de compatibilité. Le quota est converti en millisecondes à partir de `seconds` si présent, sinon de `minutes * 60` ; les deux valeurs doivent être cohérentes lorsque `seconds` est renseigné. Chaque jeu déclare à `mountGame` quand sa partie est active ; menu, scores, partie achevée et onglet masqué ne sont pas décomptés. La consommation est bornée par le crédit disponible, commune aux jeux et réinitialisée à chaque changement de date locale. Le crédit de la veille vaut zéro. Si le stockage est inaccessible/incompatible ou si le crédit est épuisé, le jeu est bloqué. Le compteur fonctionne entre xfr1 et GMR **uniquement sur une même origine web** (protocole, hôte et port) ; il n'est pas synchronisé entre appareils.

Les sessions temporaires et les records pérennes sont **distincts**. Une version incompatible de GCV peut supprimer la reprise d'une session, sans effacer les scores ou les records compatibles. Les données des autres projets ne doivent pas être modifiées par GMR. Les erreurs de stockage sont traitées sans interrompre le jeu.

## Frontières et dépendances

Les jeux utilisent `shared/` comme **infrastructure hôte** : cadre et navigation de page, catalogue, sessions, scores, confirmations et quota global. La simulation, les contrôles, le HUD et le CSS métier restent dans `games/<id>/`. Un jeu ne peut pas importer les modules internes d'un autre jeu ; un module partagé ne peut pas importer un module métier d'un jeu. Les extensions de présentation passent par des adaptateurs enregistrés côté jeu, sans ajouter de cas particuliers dans le service commun. Le point d'entrée `shared/site.css` importe les cinq feuilles de `shared/styles/` et chaque jeu charge ensuite son CSS propre, ce qui maintient les URLs existantes.

Cette séparation est motivée par l'[ADR-0001](adr/0001-frontiere-hote-jeux.md).

L'architecture propre au moteur 3D, au chronométrage, à la course et aux sauvegardes GCV figure dans [l'architecture GCV](../games/gcv/docs/ARCHITECTURE.md).

## Vérification et livraison

- Tests automatisés sans étape de build : `node --test tests/*.test.cjs` (y compris contrats du catalogue, du CSS et des adaptateurs).
- GitHub Actions exécute ces tests lors des pushes sur `main` et des pull requests.
- Rendu WebGL, multi-touch, navigation et plein écran nécessitent une validation dans les navigateurs réels ; des tests d'intégration navigateur sont à ajouter.
- Les pages statiques de `main` sont destinées à GitHub Pages ; aucune API backend n'est requise.
