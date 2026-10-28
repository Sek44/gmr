# GMR — Pistes de nettoyage et de refactoring

Revue du 27 octobre 2026 (dépôt `Sek44/gmr`). Ce document suit les refactorings transversaux proposés lors de la revue.
Les points réalisés sont conservés avec leur statut ; les autres nécessitent
encore une modification transversale, des décisions de gameplay ou des tests
visuels importants. Les priorités reflètent le risque de régression.

## Priorité haute — stabilité et architecture

1. **Séparer `games/gcv/game.js` (initialement environ 1 660 lignes) — RÉALISÉ (28/10/2026).** Le fichier mélange
   initialisation WebGL, création de géométrie, véhicules, effets visuels, entrées,
   rendu du HUD, mini-carte, navigation, sauvegarde et boucle de simulation.
   Extraire progressivement des modules aux interfaces explicites
   (`scene`, `vehicles`, `controls`, `hud`, `session`), sans réécrire toute la
   physique d'un seul coup.

   **Première extraction :** `games/gcv/vehicles.js` crée la voiture du joueur,
   son habitacle et les neuf modèles des concurrents (205 lignes déplacées).
   **Deuxième extraction :** `games/gcv/world-3d.js` construit la scène, le
   circuit, les rails, la ligne d'arrivée et le décor statique (mer, rochers,
   flaques, cailloux). Il expose les échantillons de piste et les repères
   indispensables à la conduite, à la course et à la mini-carte. `game.js`
   garde le moteur WebGL, les véhicules et la simulation. Tests de construction
   et de chargement ajoutés. **Troisième extraction :**
   `games/gcv/visual-effects.js` gère les particules dynamiques de boue et
   les étincelles de contact avec les barrières, avec leurs buffers Three.js
   et leurs animations. Le moteur de jeu ne lui transmet que l'état courant
   du véhicule et les intensités/contacts. Tests des effets et du chargement
   ajoutés. **Quatrième extraction :** `games/gcv/controls.js` regroupe
   le clavier, le volant tactile analogique, les pédales multi-touch et la
   remise à zéro des commandes ; `games/gcv/hud.js` prend en charge le
   compteur, le chrono, les records, la position et le tableau d'arrivée ;
   `games/gcv/mini-map.js` met en cache le circuit vu du ciel et affiche
   les positions du joueur et des concurrents. Des tests DOM/canvas et de
   chargement accompagnent cette extraction. **Cinquième extraction :**
   `games/gcv/rendering.js` gère le moteur WebGL, le redimensionnement,
   les vues intérieure/extérieure, les transformations des voitures, leurs
   roues et feux, et la synchronisation visuelle des concurrents. La boucle
   de simulation, la physique et les chronos restent dans `game.js`.
   Tests unitaires et de chargement ajoutés. **Sixième extraction :**
   `games/gcv/navigation.js` regroupe menu, iframe des scores et plein
   écran ; `games/gcv/session.js` gère les changements essais/course, reprise,
   redémarrage, snapshots et sauvegarde automatique. `game.js` conserve la
   boucle de simulation et un adaptateur d'état explicite. Révision de
   sauvegarde alignée sur le catalogue. Tests de navigation, sessions et
   chargement ajoutés.
2. **Unifier la progression des tours — RÉALISÉ (27/10/2026).**
   `GcvTrackProgress` conserve la progression longitudinale signée (en mètres),
   les passages physiques de ligne et les tours validés ; ses événements
   `start`/`lap` alimentent `GcvRace`, `GcvLapTimes` et le HUD.
   Les indices d'échantillonnage ne décident plus d'un tour ; le chrono ne
   valide pas de franchissement à partir des secteurs. Protections conservées :
   sens de la ligne, largeur de piste, distance réelle minimale entre passages,
   marche arrière, chute/respawn et saut d'indice près des épingles.
   Tests unitaires et transversaux ajoutés. Les anciennes sessions GCV sont
   annulées (révision 4) sans effacer les records.
3. **Ajouter des tests navigateur intégrés.** Les tests Node couvrent la logique
   isolée, mais pas l'interaction entre modules, le plein écran, l'iframe des
   scores, le multi-touch, la pause, ni le rendu des HUD portrait/paysage.
   Prévoir des scénarios Playwright sur mobile/tablette/ordinateur avec un
   petit ensemble de parcours manuels WebGL réels.

## Priorité moyenne — simplification et extensibilité

4. **Réunir les deux mécanismes d'ouverture des scores.** GCV utilise sa propre
   iframe et `shared/score-view.js` en fournit une autre pour les jeux futurs.
   Centraliser navigation, pause/reprise, historique et fermeture des scores.
5. **Découpler la page des scores de GCV.** `shared/scores.js` charge et affiche
   explicitement `GcvLapTimes` et `GcvTrackLayout`. Fournir un rendu spécifique
   par type de score ou une interface d'extension afin que les prochains jeux
   n'imposent pas de branche conditionnelle dans le code partagé.
6. **Améliorer la modélisation des états de jeu.** `game.js` utilise de nombreux
   indicateurs (`gameMode`, `menuOpen`, `scoresOpen`, `hasActiveSession`,
   `falling`, etc.) avec des transitions réparties. Introduire une machine
   d'états simple et tester les bascules mode/menu/fin/reprise/chute.
7. **Réduire les opérations répétées côté rendu.** Profiler sur téléphone avant
   optimisation : actualisations DOM, reconstruction du tableau des résultats,
   recherche linéaire des IA et génération des matériaux/objets. Mesurer
   allocations, durée des frames et consommation mémoire avec une grille
   d'appareils représentative.
8. **Clarifier le modèle de persistance.** Le niveau `GameState` gère les
   sessions et `GcvLapTimes` gère les records. Éviter deux constantes
   manuelles de révision de session (jeu/catalogue), clarifier le nettoyage des
   anciennes clés et définir une politique de migration uniquement pour les
   données pérennes. Ne jamais effacer automatiquement les records.
9. **Distinguer besoins fonctionnels et nettoyage.** Départ aléatoire sur la
   grille, numéros visibles sur les voitures IA, personnage du départ, effet
   physique des flaques, collisions/réactions des IA et éventuelle sauvegarde
   des classements de course : décisions ou fonctionnalités à planifier
   séparément avant de modifier la conduite.

## Priorité basse — maintenance

10. **Harmoniser les modules JavaScript.** Plusieurs fichiers exposent à la fois
    une globale navigateur et `module.exports` pour les tests. Étudier les
    modules ES natifs ou une façade de test, en conservant GitHub Pages et
    l'absence de compilation tant que cela reste pertinent.
11. **Rendre explicite la dépendance Three.js.** Le CDN épinglé nécessite une
    connexion réseau au premier chargement. Évaluer l'hébergement local, le
    cache et une page d'erreur/réessai, sans ajouter de build lourd.
12. **Prévoir une maintenance documentaire continue.** Garder les règles
    actuelles dans `SPECIFICATIONS.md`, consigner les anciennes étapes dans
    `CHANGELOG.md` et réviser les critères restants à chaque changement
    fonctionnel. Éviter de transformer l'historique en spécifications actives.

## Portée de la revue

Modules examinés : sources des pages de GMR, modules `shared/`, moteurs
`games/gcv/`, modèle de jeu, documentation et tests existants. Les sujets
ci-dessus sont des **pistes** et non des anomalies toutes reproduites en jeu.
Les changements de physique, de trajectoire, de chronométrage ou de rendu
importants sont volontairement exclus de cette passe.
