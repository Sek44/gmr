# Super Kart (GCV) — Architecture actuelle

Documentation technique du code situé dans `games/gcv/`. Les règles observables du jeu sont dans [SPECIFICATIONS.md](SPECIFICATIONS.md) ; les améliorations à instruire dans [BACKLOG.md](BACKLOG.md).

## 1. Chargement et orchestration

`index.html` charge les modules JavaScript du jeu dans l'ordre de leurs dépendances. `game.js` est le point d'entrée exécuté comme module ES ; il importe **Three.js 0.180.0** depuis un CDN jsDelivr, construit la scène et démarre la boucle `requestAnimationFrame`.

Il n'existe ni serveur de jeu, ni build, ni moteur physique externe. Les autres fichiers utilisent actuellement les globales `Gcv*` pour le navigateur et, en général, `module.exports` pour les tests Node.

`game.js` monte également `GmrPlayTime` sur la scène pour conserver l'affichage et le blocage en plein écran. Le service commun reçoit un indicateur d'activité issu de `flow` et déclenche le retour au menu lorsque le crédit est épuisé ; il reste indépendant du chrono des tours et des sauvegardes de session.

`game.js` demeure l'**orchestrateur de simulation** : il possède l'état mutable de conduite (position, vitesse, caméra, chute, suivi de progression, chronométrage et course), délègue aux modules spécialisés, puis transmet leur état aux composants d'affichage et à la sauvegarde. La simulation n'est pas pilotée par le rendu.

## 2. Modules par responsabilité

| Module | Responsabilité actuelle |
| --- | --- |
| `track-layout.js` | Registre des tracés fermé/ouvert, sélection, départ/arrivée, quatre profils de bosses géantes et passage coloré |
| `world-3d.js` | Géométrie ouverte/fermée, bosses profilées, sept rubans colorés, lignes de départ/arrivée à damier groupées par couleur en `InstancedMesh` (deux appels de dessin par ligne), scène/décor, points et tangentes partagés |
| `scenery.js` | Placement et paramètres du décor statique |
| `barriers.js` | Collision latérale de précision contre les rails, glissement/frottement/réalignement du cap et arrêt contre les deux barrières de fermeture de la route ouverte |
| `vehicles.js` | Modèle de voiture historique, quatre couples pilote/véhicule low-poly originaux sélectionnables (moto sportive rouge avec carénages à sections profilées, jantes ouvertes et bulle translucide procédurales, sans modèle ou texture externe) et neuf voitures IA ; roues de moto aux deux jantes et dix rayons groupés en deux `InstancedMesh` par pivot, avec cinq géométries rigides partagées entre les roues et rotation de chaque pivot conservée ; bulle translucide double face en une passe ; textures de numéros partagées et visibilité exclusive du modèle actif ; pose du motard organisée en quatre pivots légers (bassin, casque et deux épaules, exposés via `motoRider`) ; API `CHOICES`, `normalize`, `setVehicle`, `setCameraMode` |
| `physics.js` | Accélération, frein, direction, marche arrière, chute, saut balistique prolongé (`advanceJump` avec dénivelé et un seul événement d'atterrissage), commandes aériennes atténuées et boue |
| `track-progress.js` | **Autorité unique** pour les tours fermés (`move`) et les traversées ouvertes (`moveOpen`), sans bouclage artificiel des échantillons |
| `lap-times.js` | Temps et trois secteurs, terminaison de trajet ouvert, stockage distinct des records de chaque circuit |
| `scores-adapter.js` | Rendu des records de tours dans la page Scores générale, enregistré auprès de `GameScores` sans dépendance GCV dans le service partagé |
| `race.js` | Grille, phases, IA, classement ; trois tours du circuit fermé ou une traversée du parcours ouvert |
| `flow.js` | État de l'écran, activité courante et chute, avec transitions contrôlées |
| `session.js` | Entrée dans les modes, reprise, redémarrage, snapshots et autosauvegarde ; refuse une sauvegarde d'un autre circuit sans réappliquer ses anciens choix ; signal `onRaceStart` uniquement lors d'un nouveau départ en course (y compris « Départ ») |
| `preferences.js` | Préférences indépendantes des sessions : circuit, véhicule, mode et caméra, vérifiées et stockées dans `localStorage` avec repli en mémoire en cas d'indisponibilité |
| `navigation.js` | Menu, scores en iframe, commandes plein écran et pause liée à la navigation |
| `controls.js` | Clavier, direction tactile, pédales multitouch et remise à zéro des commandes |
| `rendering.js` | WebGL, caméras adaptées au véhicule choisi, travelling de grille (`startGridIntro`, progression de 3,8 s côté → arrière → cockpit selon la vue, annulable et interrompu pendant une pause), visibilité du pilote coordonnée via `onCameraVisibility`, transformations, rotation des roues, inclinaison de la moto vers l'intérieur des virages (roulis de même signe que la rotation du cap), assiette pendant les sauts et animation procédurale amortie du motard suivant vitesse, accélération, rotation et atterrissage ; ombres planes frontales à dégradé partagé : une ombre joueur indépendante (alpha atténué pendant le saut) et une seule `InstancedMesh` pour les neuf ombres IA, matrices mises à jour sur le sol sans suivre la hauteur du saut, lot exclu du frustum culling obsolète |
| `visual-effects.js` | Particules dynamiques de boue et étincelles de friction ; petite gerbe radiale de poussière à l'atterrissage réutilisant le tampon de particules existant (`land`) sans nouvel appel de dessin |
| `hud.js` | Indicateurs de conduite, chrono, classements et panneau d'arrivée ; les affectations DOM texte, attributs, visibilité et classes sont évitées lorsqu'elles ne changent pas |
| `mini-map.js` | Carte ouverte/fermée, départ et arrivée distincts, secteurs et marqueurs dynamiques |
| `adaptive-resolution.js` | Politique pure d'ajustement du facteur de résolution (échelle 1 → 0,55), basée sur les intervalles des frames WebGL actives ; fenêtre temporelle, hystérésis, stabilisation et remontée lente avec retour arrière en cas de régression |

## 3. Flux de simulation

1. À chaque frame active, `game.js` lit les entrées de `controls.js` et calcule la conduite via `physics.js`.
2. `barriers.js` corrige le contact avec les rails ; le suivi du segment de piste utilise les points et tangentes générés par `world-3d.js`.
3. `track-progress.js` projette le déplacement réel sur la tangente, reconnaît le passage géométrique de ligne et produit des événements `start` ou `lap` **validés**. Les indices d'échantillon n'autorisent pas les tours.
4. `lap-times.js` reçoit la progression pour les secteurs et les événements de ligne validés pour le chrono. `race.js` reçoit le même mouvement/les mêmes événements pour les tours, les temps de passage et le classement ; le moteur de course avance aussi les IA.
5. `race.js` reste autoritaire pour ses phases (`staging`, `countdown`, `racing`, `finished`) ; `flow.js` synchronise ces phases et contrôle leur transition. Les axes écran (`menu`, `play`, `scores`) et chute sont indépendants de l'avancement de la course. `session.js` déclenche le travelling de départ par `onRaceStart` après le placement sur la grille ; `rendering.js` anime uniquement la caméra pendant l'attente et le décompte, sans modifier la simulation ni la progression des phases. Le temps de travelling n'est pas persisté.
6. `hud.js`, `mini-map.js`, `rendering.js` et `visual-effects.js` présentent l'état résultant, sans recalculer les tours. Le chrono est rafraîchi une seule fois par frame courante après les mises à jour de simulation et du temps de maintien (les transitions de session le rafraîchissent aussi si nécessaire).
7. `session.js` extrait des snapshots du même état pour la persistance.

**Invariant clé :** un affichage, un secteur chronométré ou la progression approximative des concurrents ne doit jamais fabriquer un franchissement de tour du joueur. Voir [ADR-0001](adr/0001-progression-des-tours.md).

## 4. Navigation, pause et états

`flow.js` modélise l'écran (`menu`, `play`, `scores`), l'activité (`empty`, `free`, `staging`, `countdown`, `racing`, `finished`) et l'état de chute (`on-track` ou `falling`).

`navigation.js` gère le menu, la reprise, le plein écran et la consultation de `scores.html` dans une iframe dédiée. Ouvrir les scores ou le menu suspend l'avancement du temps simulé et les appels de dessin WebGL, sans effacer les commandes sauvegardées ou changer arbitrairement les tours. Le menu opaque recouvre la scène et cache son canvas ; le rendu reprend en jeu. `session.js` réalise les bascules de mode et restaure l'état adéquat.

L'unification de cette iframe spécifique avec `shared/score-view.js` reste ouverte dans le [backlog global](../../../docs/BACKLOG.md).

## 5. Persistance

- **Préférences durables** : `preferences.js` enregistre `gmr:v1:gcv:preferences` (circuit, véhicule, mode et caméra). Le menu reste la source du dernier choix ; les sauvegardes de course ne peuvent pas l'écraser. Les liens explicites `?track=` et `?vehicle=` ont priorité à l'ouverture.
- **Session jetable** : `shared/game-state.js` enregistre `gmr:v1:state:gcv`. Le snapshot inclut notamment caméra, **identifiant de la paire véhicule-pilote**, état de progression, chrono, course/IA et essais éventuellement conservés. `session.js` sauvegarde lors des changements significatifs, environ toutes les 1,5 s de simulation, et sur les événements de fermeture/masquage gérés par `GameState`.
- **Compatibilité des sessions** : `SAVE_REVISION` dans `game.js` et `saveRevision` dans `games/catalog.js` doivent évoluer **ensemble** en cas de rupture ; une ancienne session peut alors être rejetée, puis le menu reste le point d'entrée.
- **Records personnels** : `lap-times.js` enregistre les trois meilleurs temps classiques dans `gmr:v1:gcv:lap-records:v2`, et ceux du parcours Arc-en-ciel dans `gmr:v1:gcv:lap-records:v2:rainbow`, indépendamment des sessions. Une clé/empreinte du tracé conditionne leur validité ; les ajustements de largeur des accotements peuvent rester compatibles.
- **Historique général** : `shared/scores.js` gère séparément `gmr:v1:scores`. L'affichage des records de tours relève de `scores-adapter.js`, déclaré via `scoreScripts` dans `games/catalog.js` et chargé par `shared/scores-page.js` après le service partagé. Le classement d'une course GCV n'est pas actuellement enregistré comme score générique.

Une modification de session ne doit jamais effacer automatiquement les records de tours compatibles ou l'historique général.

## 6. Contrôle qualité

Les tests Node `tests/gcv-*.test.cjs` couvrent notamment la physique, les barrières, le monde 3D, les états de navigation/session, la course et la progression unifiée. La commande globale est `node --test tests/*.test.cjs`.

Le rendu WebGL réel, le plein écran, le multi-touch et les présentations mobiles restent à valider en navigateur ; une automatisation intégrée est prévue dans le backlog. Trois.js est chargé depuis un CDN au démarrage : le fonctionnement hors connexion au premier chargement n'est pas garanti.

Les décalques transparents horizontaux (`world-3d.js` : boue, flaques et reflets ; `rendering.js` : ombres) utilisent `FrontSide`, puisque leur normale est dirigée vers le haut. La bulle de moto utilise `DoubleSide` avec `forceSinglePass`, restant visible depuis les caméras extérieure et intérieure. Les géométries roues et les ressources du lot d'ombres sont libérées avec les ressources de scène lors d'un changement de circuit. Le parcours ouvert utilise un échantillonnage à 720 segments, des décorations plus légères, un framebuffer plafonné à 750 000 pixels et un rendu sans MSAA. Le circuit classique conserve son plafond DPR initial de 1,7. **Pendant le jeu actif uniquement**, `game.js` transmet les timestamps de `requestAnimationFrame` à `adaptive-resolution.js` après `rendering.render()` ; le contrôleur utilise `rendering.setResolutionScale()` (défaut 1) pour multiplier le DPR déjà limité par le circuit. Les niveaux autorisés sont 1, 0,9, 0,8, 0,7, 0,6 et 0,55 : baisse après ralentissement durable, remontée seulement après environ 18 secondes stables avec vérification et attente après un essai raté. Les 1,2 seconde suivant un changement sont exclues des mesures. Les menus/scores, onglets masqués, reprises, redimensionnements et bascules plein écran remettent à zéro les échantillons, mais **pas** le jeu ou les scores. Le contrôleur est recréé avec la scène lors d'un changement de circuit. Il ne mesure pas directement la charge GPU et n'enregistre aucune préférence de qualité. Les ressources JS/CSS du jeu portent un identifiant de version dans leur URL pour éviter les mélanges de modules mis en cache.

Le parcours est sélectionné via `?track=rainbow` si présent, sinon depuis les préférences locales (classique par défaut), avec rechargement de la scène et annulation possible des anciennes sessions. `world-3d.js` livre les indices de départ/arrivée au moteur ; `game.js` calcule la longueur entre les deux portes pour la progression/IA tout en conservant la longueur intégrale de spline pour le rendu. Le saut est un écart vertical temporaire qui ne produit aucun événement de course.

Les barrières de la route ouverte ne constituent jamais une boucle de collision : le maillage des côtés est échantillonné moins finement que les collisions, les deux capuchons transversaux sont dessinés par `world-3d.js` aux extrémités réelles et `barriers.js` bloque les franchissements. L'assistance de zigzag exploite une fonction continue et déterministe `SPRINT.zigzagAt` dans `track-layout.js`, avec oscillations rapides à faible amplitude et enveloppe `smoothstep`. La Route Arc-en-ciel est maintenant longue d'environ 2,55 km et comporte quatre bosses de 14 à 18 m. En l'air, `track-progress.js#guideAirborne` suit l'arc des segments de piste dans le sens du parcours et limite le décalage latéral à la chaussée moins 1,8 m, sans créer de distance au-delà du bout de la route. Il fournit un déplacement longitudinal réel au moteur de progression, afin que les courbes franchies en vol comptent et que la ligne d'arrivée puisse être détectée géométriquement. L'arrivée ouverte est affichée même lorsqu'un secteur manquant empêche un record. Les sauts restent indépendants du comptage de tours : `game.js` anticipe le sommet d'une bosse par projection continue entre échantillons, `physics.js` décide du déclenchement et intègre une longue trajectoire balistique avec dénivelé soustrait à chaque frame et retourne un événement unique `landed`, puis `visual-effects.js` émet la poussière exactement à ce moment. Le déplacement horizontal et les chronos suivent toujours le moteur principal. Le motard utilise la direction demandée, la variation effective du cap, les variations de vitesse et l'état de saut transmis à `rendering.js`. Ce module anime quatre pivots (bassin, tête, deux épaules) par interpolation exponentielle bornée : déplacement latéral, inclinaison en virage, bras asymétriques, recul au démarrage, avancée au freinage, léger mouvement vertical et réception. L'amplitude de la pose est volontairement perceptible en vue extérieure, avec une caméra légèrement rapprochée pour la moto. Aucun os, nouvelle géométrie, nouveau rendu ou donnée de sauvegarde n'est nécessaire. La pose revient à la position neutre au changement de véhicule.

## 7. Benchmark 3D autonome

La page [`benchmark.html`](../benchmark.html) est un outil de diagnostic séparé du jeu. Elle charge les mêmes modules `world-3d.js`, `vehicles.js`, `rendering.js`, `visual-effects.js` et la même version Three.js, mais pas `game.js`, `GmrPlayTime`, `GameState` ni la sauvegarde des scores.

Le plan pur `benchmark-config.js` définit sept séquences : quatre scènes de référence (classique solo, course classique à 10 voitures, moto solo, Arc-en-ciel à 10 voitures) et trois passages supplémentaires de **la même course classique**, à 75 %, 55 %, puis 100 % (répétition pour surveiller la dérive). Toutes les passes classiques réutilisent la **même scène et le même WebGLRenderer**, avec un facteur de résolution appliqué par `rendering.js#setResolutionScale()`. Ce facteur vaut 1 par défaut : le jeu normal conserve son rendu actuel. Chaque séquence comporte 1,5 s d'échauffement exclues des mesures puis 8 s de collecte de `requestAnimationFrame`. Le passage Arc-en-ciel utilise toujours son propre framebuffer plafonné.

`benchmark.js` profile avec `performance.now()` les étapes trajet/courbe, synchronisation des IA, véhicule, particules, caméra et appel JavaScript à `renderer.render()`. `benchmark-metrics.js` résume FPS, P50/P95/P99/max d'intervalle, pics >20/33/50 ms, P95/P99 de travail JavaScript, moyenne par étape, draw calls et triangles. Le temps mesuré autour de WebGL **n'est pas** un véritable chrono GPU et peut inclure une attente du pilote. `rendering.js#getMetrics()` expose `renderer.info` et les dimensions réelles du framebuffer.

Le rapport final affiche **trois pages adaptées aux captures mobiles** : fluidité/draw calls, profil JavaScript, résolution/matériel. Il peut aussi être copié en JSON. Le lancement recommande le **plein écran**, demandé immédiatement depuis le clic utilisateur par `benchmark-display.js` avant tout chargement asynchrone ; si l'API est absente ou refuse, un bouton explicite permet le test en fenêtre. Le mode réel, l'orientation et le viewport sont enregistrés dans les résultats, et toute sortie du plein écran pendant les mesures les invalide. Le rapport peut rester en plein écran pour les captures, avec un bouton pour en sortir. L'onglet masqué ou un changement de taille de la scène invalide aussi le passage. La page **n'exécute pas** les règles de conduite, la physique, le HUD ou les sauvegardes ; elle permet de comparer des charges graphiques synthétiques et non d'estimer directement le temps GPU ou la performance complète du jeu. Voir [PERFORMANCE.md](PERFORMANCE.md) pour la méthode et les pistes à explorer.
