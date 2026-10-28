# ADR-0001 — Une seule source de vérité pour les tours du joueur

- **Statut :** Accepté (décision déjà appliquée)
- **Date :** 27 octobre 2026
- **Portée :** GCV — progression, course, chronométrage et classement

## Contexte

Un suivi fondé sur l'indice du point de piste le plus proche peut sauter artificiellement dans les épingles ou manquer la ligne d'arrivée à grande vitesse. Des comptages indépendants entre course, chronométrage et HUD peuvent diverger : un joueur peut apparaître à une mauvaise place, ne pas valider un tour ou terminer trop tôt.

Ces composants doivent partager une définition unique et vérifiable du franchissement, sans déduire un tour du passage d'un secteur ou d'un compteur affiché.

## Options considérées

1. Conserver des progressions indépendantes par sous-système et les resynchroniser périodiquement : peu coûteux au départ, mais plusieurs sources de vérité et des incohérences difficiles à diagnostiquer.
2. Valider les tours à partir des index d'échantillons/secteurs : simple, mais sensible aux raccourcis apparents et aux sauts d'index.
3. Centraliser la progression physique signée et les franchissements géométriques de la ligne d'arrivée : nécessite une interface commune, mais rend les événements de tour explicites et testables.

## Décision

Retenir la **troisième option** :

- `GcvTrackProgress` intègre le déplacement physique projeté sur la tangente de piste, avec son signe.
- Un événement `start` ou `lap` exige un véritable franchissement géométrique dans le bon sens, dans la largeur de la ligne et après une distance minimale admissible.
- La recherche de l'échantillon le plus proche sert à localiser le véhicule, **pas** à déclarer un tour. La chute et le respawn n'ajoutent pas de progression fictive.
- `GcvRace` et `GcvLapTimes` consomment les événements validés ; les secteurs chronométrés ne pilotent pas les tours de course. Le HUD lit ces résultats sans ses propres règles de passage.

## Conséquences

- **Positives :** cohérence entre tours, arrivée, classement et chronométrage ; comportements reproductibles dans des tests unitaires et transversaux, même en marche arrière ou près des épingles.
- **Compromis :** les consommateurs dépendent du contrat d'événements de `GcvTrackProgress` ; tout changement de validation nécessite une vérification simultanée de la course et des chronos.
- **Invariants à préserver :** aucune avance gratuite par déplacement latéral, saut d'index, oscillation sur la ligne ou repositionnement après chute.

## Références actuelles

- [Architecture GCV](../ARCHITECTURE.md)
- Code : `track-progress.js`, `race.js`, `lap-times.js`, `game.js`
- Tests : `tests/gcv-track-progress.test.cjs`, `tests/gcv-unified-progress.test.cjs`, `tests/gcv-race.test.cjs`
