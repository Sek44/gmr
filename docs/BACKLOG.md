# GMR — Backlog transversal

Ce document ne contient que des **travaux ouverts** concernant plusieurs jeux ou les services communs. Les idées sont à confirmer avant réalisation ; ce ne sont pas toutes des anomalies reproduites. Les travaux propres à GCV figurent dans son [backlog](../games/gcv/docs/BACKLOG.md).

## Priorité haute

- [ ] **Tests d'intégration navigateur pour GMR.** Définir une base légère (par exemple Playwright) pour les parcours d'accueil, les scores, la navigation et la sauvegarde/reprise, avec scénarios mobile/tablette/ordinateur. Conserver des vérifications manuelles pour les comportements WebGL et tactiles non fiabilisés par l'automatisation.

## Priorité moyenne

- [ ] **Unifier l'ouverture des scores.** GCV possède une iframe/navigation de scores dédiée, tandis que `shared/score-view.js` fournit un mécanisme générique. Définir une seule interface pour ouverture, pause, retour, historique et fermeture, sans régression de reprise de session.
- [ ] **Découpler les scores partagés des formats GCV.** `shared/scores.js` charge directement `GcvLapTimes` et `GcvTrackLayout`. Concevoir un mécanisme d'extension par type de jeu/record, puis supprimer les dépendances spécifiques du code partagé.
- [ ] **Clarifier les conventions de persistance communes.** Définir le cycle de vie des sessions jetables et des scores pérennes, le comportement sur données corrompues, l'obsolescence des clés et la politique de migration des seules données à conserver. Éviter de remettre à zéro les records lors d'une révision de session.

## Priorité basse

- [ ] **Étudier une convention de modules JavaScript homogène.** Plusieurs fichiers exposent à la fois une globale navigateur et `module.exports` pour les tests. Évaluer les modules ES natifs ou une façade de test, en préservant le chargement statique GitHub Pages et l'absence de build.

Les fonctionnalités propres à GCV (grille, IA, obstacles, rendu ou validations de conduite) ne doivent pas être suivies une seconde fois ici.
