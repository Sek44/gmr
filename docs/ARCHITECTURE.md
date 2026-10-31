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
| `shared/home.js` et `shared/site.css` | Catalogue, page d'accueil et présentation responsive |
| `shared/game-state.js` (`GameState`) | Sauvegarder et restaurer une session par jeu ; enregistrer également lors de `pagehide` et du masquage de l'onglet |
| `shared/scores.js` (`GameScores`) | Historique général des scores, affichage, courbes et suppression ciblée |
| `shared/scores-page.js` | Entrée de la page de consultation des scores |
| `shared/score-view.js` (`ScoreView`) | Afficher les scores dans une iframe en suspendant/reprenant le jeu qui utilise ce service |
| `shared/app-confirm.js` (`AppConfirm`) | Dialogues de confirmation |
| `shared/game-ui.js` (`GameUI`) | Composants d'interface réutilisables, dont le pavé numérique |
| `shared/play-time.js` (`GmrPlayTime`) | Lecture du crédit xfr1, temps de jeu partagé, affichage et verrouillage |

Le mode d'affichage des scores de GCV dispose encore de sa propre navigation/iframe ; l'unification avec `ScoreView` est dans le [backlog global](BACKLOG.md). L'affichage général des records GCV contient également une dépendance spécifique à ce jeu, à découpler avant l'ajout de nouveaux formats.

## Stockage et données

Le stockage s'effectue localement via `localStorage`, sans comptes ni synchronisation entre appareils :

- `gmr:v1:state:<id>` : session en cours, gérée par `GameState` ;
- `gmr:v1:scores` : historique commun, géré par `GameScores` ;
- `gmr:v1:daily-play-time` : consommation globale du jour `{version, date, elapsedMs}` ;
- les jeux peuvent conserver d'autres données pérennes spécifiques, documentées dans leur architecture.

`shared/play-time.js` lit la clé xfr1 **sans jamais la modifier** : `entrainement_daily_exercises_v1`, version 1, avec date locale et minutes autorisées. Chaque jeu déclare à `mountGame` quand sa partie est active ; menu, scores, partie achevée et onglet masqué ne sont pas décomptés. La consommation est bornée par le crédit disponible, commune aux jeux et réinitialisée à chaque changement de date locale. Le crédit de la veille vaut zéro. Si le stockage est inaccessible/incompatible ou si le crédit est épuisé, le jeu est bloqué. Le compteur fonctionne entre xfr1 et GMR **uniquement sur une même origine web** (protocole, hôte et port) ; il n'est pas synchronisé entre appareils.

Les sessions temporaires et les records pérennes sont **distincts**. Une version incompatible de GCV peut supprimer la reprise d'une session, sans effacer les scores ou les records compatibles. Les données des autres projets ne doivent pas être modifiées par GMR. Les erreurs de stockage sont traitées sans interrompre le jeu.

## Frontières et dépendances

Les jeux peuvent réutiliser `shared/`, mais pas importer les modules internes d'un autre jeu. Les composants communs ne devraient pas dépendre des détails internes d'un jeu particulier ; les exceptions existantes sont suivies dans le backlog.

L'architecture propre au moteur 3D, au chronométrage, à la course et aux sauvegardes GCV figure dans [l'architecture GCV](../games/gcv/docs/ARCHITECTURE.md).

## Vérification et livraison

- Tests automatisés sans étape de build : `node --test tests/*.test.cjs`.
- GitHub Actions exécute ces tests lors des pushes sur `main` et des pull requests.
- Rendu WebGL, multi-touch, navigation et plein écran nécessitent une validation dans les navigateurs réels ; des tests d'intégration navigateur sont à ajouter.
- Les pages statiques de `main` sont destinées à GitHub Pages ; aucune API backend n'est requise.
