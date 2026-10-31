# <Nom du jeu> — Architecture actuelle

Décrire les composants qui existent réellement et leurs responsabilités. Supprimer les rubriques inutiles pour un petit jeu ; ne pas raconter les refactorings passés.

## Point d'entrée et modules

À compléter selon le code réel du jeu. Le modèle utilise `GmrPlayTime.mountGame` depuis `shared/play-time.js` : adapter `isPlaying` pour exclure les menus, pauses, scores et écrans de fin.

## Flux et état du jeu

À compléter : interactions, sauvegarde/restauration et éventuelles contraintes importantes.

Les décisions structurantes qui nécessitent une justification durable peuvent avoir un ADR dans `adr/` ; le document n'a pas à être créé si aucun choix ne le nécessite.
