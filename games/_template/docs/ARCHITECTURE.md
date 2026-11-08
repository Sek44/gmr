# <Nom du jeu> — Architecture actuelle

Décrire les composants qui existent réellement et leurs responsabilités. Supprimer les rubriques inutiles pour un petit jeu ; ne pas raconter les refactorings passés.

## Point d'entrée et modules

À compléter selon le code réel du jeu. La page du jeu charge `../../shared/site.css` (cadre et composants), puis, si nécessaire, `./game.css` (styles de gameplay). Les services communs viennent de `../../shared/` ; le jeu reste indépendant de tous les autres jeux.

Le modèle utilise `GmrPlayTime.mountGame` depuis `shared/play-time.js` : adapter `isPlaying` pour exclure les menus, pauses, scores et écrans de fin.

## Flux et état du jeu

À compléter : interactions, sauvegarde/restauration et éventuelles contraintes importantes.

Les décisions structurantes qui nécessitent une justification durable peuvent avoir un ADR dans `adr/` ; le document n'a pas à être créé si aucun choix ne le nécessite.

## Scores particuliers

Pour un format autre que le score numérique générique, créer un éventuel `scores-adapter.js` dans le jeu, enregistrer sa présentation avec `GameScores.registerRenderer(id, render)`, et déclarer les scripts requis dans `scoreScripts` de `games/catalog.js`. Ne pas ajouter de branches spécifiques au jeu dans `shared/scores.js`.
