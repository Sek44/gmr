# Modèle de nouveau jeu

1. Copier ce dossier vers `games/<identifiant>` (par exemple `games/memory`).
2. Dans `game.js`, remplacer `game-id` par le nouvel identifiant.
3. Dans `index.html`, personnaliser titres, contenu et lien vers `scores.html`.
4. Adapter les trois documents dans `docs/` : `SPECIFICATIONS.md` (comportement actuel), `ARCHITECTURE.md` (composants réels) et `BACKLOG.md` (travaux restant à faire). Donner un identifiant stable à chaque entrée de backlog (ex. `MEMORY1`), et conserver le dernier ID attribué même après suppression d'une tâche. Aucun changelog ni fichier de refactoring permanent.
5. Ajouter l'entrée à `games/catalog.js`, par exemple :
   `{ id: "memory", title: "Mémoire", description: "Retrouve les paires.", icon: "★" }`
6. Appeler `autosave.changed()` après chaque modification significative de l'état de jeu.
7. Appeler `autosave.stop({ discard: true })` quand la partie est définitivement terminée, puis `GameScores.save({ gameId, score, total })` une seule fois si un résultat doit être enregistré.

Ce répertoire n'est pas inscrit au catalogue et ne correspond pas à un jeu publié. Les chemins relatifs `../../` sont compatibles avec GitHub Pages sous `/gmr/`.

Voir [la convention documentaire](../../docs/README.md) et [les instructions des agents](../../AGENTS.md).
