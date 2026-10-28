# GCV — Backlog

**Dernier identifiant attribué : GCV13.** Le prochain sera `GCV14` ; ne jamais réutiliser un ID supprimé.

Travaux **ouverts uniquement**, extraits des exigences non réalisées, vérifications restant à faire et pistes de la revue du 27 octobre 2026. Les éléments ci-dessous sont à prioriser/valider : une piste technique n'est pas forcément un bug reproduit. Les sujets communs à plusieurs jeux sont suivis dans le [backlog GMR](../../../docs/BACKLOG.md).

## Validation et stabilité — priorité haute

- [ ] **GCV1 — Valider les parcours GCV sur de vrais navigateurs.** Tester sur téléphone/tablette (portrait et paysage) et ordinateur : commandes simultanées, pause/menu/scores, plein écran accepté/refusé, HUD et chrono, vue cockpit, barrière, chute/respawn, trois tours complets, dépassements et classement final.
- [ ] **GCV2 — Ajouter des scénarios GCV au futur harnais de tests navigateur.** Couvrir reprise, navigation vers les scores, compte à rebours, transitions de phases, non-régression du classement et du nombre de tours ; compléter par des parcours manuels WebGL. Pré-requis : GMR1 (tests d'intégration navigateur).

## Fonctionnalités à concevoir — priorité à décider

- [ ] **GCV3 — Grille de départ aléatoire.** Le joueur est aujourd'hui en 5ᵉ position ; décider si sa place doit varier et vérifier les dix emplacements.
- [ ] **GCV4 — Départ incarné.** Ajouter éventuellement un personnage donnant le départ et un message « PARTEZ ! » plus explicite. Aujourd'hui, seuls les états d'attente et le décompte sont affichés.
- [ ] **GCV5 — Effets de terrain.** Définir un comportement de dérapage pour les flaques, graviers et cailloux visibles ; actuellement ils sont principalement décoratifs et l'adhérence reste homogène.
- [ ] **GCV6 — Interactions entre concurrents.** Étudier collisions, réactions et dépassements physiques de l'IA ; les véhicules suivent aujourd'hui une progression simplifiée.
- [ ] **GCV7 — Numéros lisibles sur les voitures IA.** Vérifier et compléter la représentation du numéro directement sur chaque carrosserie, distincte de la désignation dans le classement.
- [ ] **GCV8 — Après-course et scores.** Décider du podium/animation, d'une récompense ou score numérique, de l'enregistrement éventuel des classements et du comportement attendu une fois le joueur arrivé.
- [ ] **GCV9 — Caméra et confort.** Évaluer l'intérêt d'un zoom extérieur progressif ; valider le cadrage et la visibilité du cockpit avant de le développer.

## Performance et maintenance — priorité moyenne/basse

- [ ] **GCV10 — Profiler le rendu sur mobile avant optimisation.** Mesurer frame time et allocations ; examiner les mises à jour du DOM/HUD, la reconstruction des résultats, les recherches d'IA et la création d'objets/matériaux. Ne refactoriser qu'après mesure.
- [ ] **GCV11 — Centraliser la révision des sessions GCV.** Éviter deux valeurs manuelles synchronisées entre `game.js` et `games/catalog.js`, tout en préservant la politique d'annulation des anciennes sessions et de conservation des records.
- [ ] **GCV12 — Fiabiliser la livraison de Three.js.** Évaluer chargement local/cache et message de réessai lorsque le CDN est inaccessible, sans introduire de chaîne de compilation lourde.
- [ ] **GCV13 — Contrôles visuels ciblés.** Vérifier sur appareil réel les rails dans les épingles, le frottement en virage rapide, les rochers et la mer à l'horizon, la mini-carte, les particules et le comportement de reprise après chute.

Aucun travail déjà terminé de découpage de `game.js`, de fusion de la progression des tours ou de modélisation des états ne reste dans ce backlog. L'architecture actuelle est décrite dans [ARCHITECTURE.md](ARCHITECTURE.md).
