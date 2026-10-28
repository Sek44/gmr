# Documentation de GMR

La documentation est versionnée avec le code. Elle décrit l'état **actuel** du projet ; l'historique détaillé est accessible dans Git.

## Où documenter ?

| Périmètre | Référence |
| --- | --- |
| Site, modules partagés et conventions transversales | [Architecture globale](ARCHITECTURE.md) |
| Travaux transversaux encore ouverts | [Backlog global](BACKLOG.md) |
| Choix structurants communs | [ADR globaux](adr/README.md) |
| Règles du jeu GCV | [Spécifications GCV](../games/gcv/docs/SPECIFICATIONS.md) |
| Architecture du jeu GCV | [Architecture GCV](../games/gcv/docs/ARCHITECTURE.md) |
| Travaux propres à GCV | [Backlog GCV](../games/gcv/docs/BACKLOG.md) |
| Justifications techniques propres à GCV | [ADR GCV](../games/gcv/docs/adr/0001-progression-des-tours.md) |

Chaque nouveau jeu conserve ses références dans `games/<id>/docs/`. Le dossier `games/_template/docs/` sert de point de départ ; les documents non pertinents n'ont pas besoin d'être créés.

## Principes de maintenance

- **Spécifications** : comportement et contraintes fonctionnelles en vigueur, pas les souhaits futurs ou l'historique des corrections.
- **Architecture** : composants, responsabilités, interfaces et invariants tels qu'ils existent dans le code, sans récit des refactorings.
- **Backlog** : problèmes vérifiés ou pistes à instruire et travail restant à faire ; retirer les sujets clos, sans conserver de journal des tâches terminées. Une piste n'est pas une anomalie confirmée.
- **ADR** : une décision structurante et sa justification durable ; conserver l'ancien ADR et indiquer « Remplacé par » lorsque la décision change.
- **Git** : seule source détaillée de l'historique. Pas de changelog ou de journal de refactoring permanent.

Une modification doit mettre à jour **dans le même changement** les documents dont les affirmations deviennent inexactes. Ne pas recopier les règles d'un jeu dans l'architecture globale ; y mettre un lien. La documentation ne remplace pas les tests.

Les instructions opérationnelles destinées aux agents sont dans [AGENTS.md](../AGENTS.md), avec d'éventuelles instructions plus locales au jeu.
