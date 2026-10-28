# GMR — instructions de développement

## Projet et invariants

- Site statique destiné aux enfants, publié sur GitHub Pages sans framework ni compilation obligatoire.
- Monorepo : `games/<id>/` pour chaque jeu, `shared/` pour le commun, `docs/` pour l'architecture et le backlog transversaux. Les jeux présents dans `games/catalog.js` sont seuls affichés dans l'accueil.
- Utiliser des URLs relatives (compatibilité avec `https://sek44.github.io/gmr/`) et une interface tactile responsive sur téléphone/tablette en portrait/paysage et sur ordinateur.
- Réutiliser `GameState`, `GameScores`, `AppConfirm`, `ScoreView` et `GameUI` plutôt que copier leur logique. Aucun jeu ne doit importer du code spécifique à un autre jeu.
- Sauvegarder la partie après les mutations importantes et lors de `pagehide` ou du masquage de l'onglet. Une visite des scores ou un retour à l'accueil ne doit pas faire perdre la partie.
- Une partie terminée ne doit pas être restaurée ni enregistrer deux fois son score. Ne jamais effacer tout l'historique de scores ; une suppression individuelle exige confirmation.
- Les clés `localStorage` de GMR commencent par `gmr:v1:` ; ne jamais toucher aux clés de xfr1/exercices. Les erreurs d'accès au stockage doivent rester non bloquantes.
- Les sessions **GCV** anciennes peuvent être annulées après une modification incompatible : augmenter ensemble `SAVE_REVISION` dans `games/gcv/game.js` et `saveRevision` dans `games/catalog.js`. Après rejet, retour au menu principal. **Ne pas effacer les records de tours compatibles ni l'historique des scores.** Pour les autres jeux, préserver la compatibilité des sauvegardes ; si l'heure d'un score est absente, afficher `00:00`.

## Documentation obligatoire avec le code

Avant une modification, lire [les conventions documentaires](docs/README.md) puis les documents du périmètre concerné. Pour GCV, voir aussi [les instructions locales](games/gcv/AGENTS.md).

- `docs/ARCHITECTURE.md` et `docs/BACKLOG.md` à la racine concernent uniquement les sujets transversaux.
- Chaque jeu maintient `games/<id>/docs/SPECIFICATIONS.md` (règles **actuelles**), `ARCHITECTURE.md` (organisation **actuelle**) et `BACKLOG.md` (travaux **ouverts**). Le modèle est dans `games/_template/docs/`.
- Modifier spécifications et architecture **dans le même changement** que le comportement ou les responsabilités qui évoluent ; supprimer/remplacer les affirmations devenues fausses, ne pas ajouter un journal des étapes.
- Chaque tâche de backlog a un **ID stable et unique** : `GMR1`, `GMR2`, ... au global, `GCV1`, `GCV2`, ... pour GCV et `<ID-DU-JEU-EN-MAJUSCULES>1`, ... pour les futurs jeux. Préfixer chaque entrée par cet ID (`- [ ] **GCV2 — Titre.** ...`).
- Attribuer les numéros **dans l'ordre croissant** en s'appuyant sur « Dernier identifiant attribué » dans chaque backlog. Mettre ce compteur à jour lors de la création d'une tâche ; ne jamais renuméroter ni réutiliser les IDs, même après suppression des tâches achevées. Préserver les IDs lors du tri ou du changement de priorité.
- Lorsqu'un travail du backlog est terminé, **retirer** son entrée sans réduire le dernier ID attribué ; lorsqu'un nouveau besoin est envisagé, l'inscrire au backlog plutôt que dans les règles du jeu livrées.
- Consigner seulement les **décisions architecturales structurantes** avec leur contexte, options et conséquences dans `docs/adr/` ou `games/<id>/docs/adr/`. Un ADR accepté reste historique ; s'il est remis en cause, créer le successeur et marquer l'ancien comme remplacé. L'architecture de référence décrit toujours la décision active.
- **Ne pas créer de changelog ni de fichier `REFACTORING.md` permanent.** L'historique est conservé dans Git. Un plan de chantier temporaire peut exister le temps des travaux.
- Éviter la duplication entre documents : préférer un lien vers la source de vérité.

## Vérification

- Exécuter `node --test tests/*.test.cjs` avant publication.
- Vérifier les liens et chemins relatifs après déplacement de documentation.
- Signaler explicitement les vérifications navigateur (WebGL, plein écran, tactile) non réalisées.
