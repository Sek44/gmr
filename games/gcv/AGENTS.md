# GCV — consignes locales pour les agents

Lire, avant de modifier le jeu, `docs/SPECIFICATIONS.md` (règles), `docs/ARCHITECTURE.md` (responsabilités et invariants), `docs/BACKLOG.md` (travaux ouverts), ainsi que les instructions de `../../AGENTS.md`.

- Ne pas introduire un deuxième compteur de tours : `GcvTrackProgress` valide les franchissements, `GcvRace` et `GcvLapTimes` les consomment. Voir `docs/adr/0001-progression-des-tours.md`.
- Conserver la séparation `GcvFlow` (écrans et activité), `GcvSession` (snapshots/transitions de mode) et `game.js` (simulation).
- Après changement incompatible de session, synchroniser `SAVE_REVISION` de `game.js` et `saveRevision` de `../catalog.js` ; annuler les sessions anciennes, jamais les records compatibles.
- Référencer les tâches par leur ID immuable (`GCV1`, etc.), et consulter le compteur de `docs/BACKLOG.md` avant de créer un nouvel item. Ne pas renuméroter lors des changements de priorité.
- Actualiser les docs de référence dans le même changement que le code. Ne pas consigner un historique des étapes, ni conserver les tâches terminées dans le backlog.
- Lancer `node --test tests/*.test.cjs` depuis la racine ; signaler séparément les validations WebGL/mobile qui nécessitent un navigateur réel.
