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
| `track-layout.js` | Registre des tracés fermé/ouvert, sélection par identifiant, départ et arrivée, bosses et passage coloré |
| `world-3d.js` | Géométrie ouverte/fermée, bosses profilées, sept rubans colorés, lignes, scène/décor, points et tangentes partagés |
| `scenery.js` | Placement et paramètres du décor statique |
| `barriers.js` | Collision latérale de précision contre les rails, glissement/frottement/réalignement du cap et arrêt contre les deux barrières de fermeture de la route ouverte |
| `vehicles.js` | Modèle de voiture historique, quatre couples pilote/véhicule low-poly originaux sélectionnables et neuf voitures IA ; textures de numéros partagées et visibilité exclusive du modèle actif ; API `CHOICES`, `normalize`, `setVehicle`, `setCameraMode` |
| `physics.js` | Accélération, frein, direction, marche arrière, chute et émission théorique de boue |
| `track-progress.js` | **Autorité unique** pour les tours fermés (`move`) et les traversées ouvertes (`moveOpen`), sans bouclage artificiel des échantillons |
| `lap-times.js` | Temps et trois secteurs, terminaison de trajet ouvert, stockage distinct des records de chaque circuit |
| `scores-adapter.js` | Rendu des records de tours dans la page Scores générale, enregistré auprès de `GameScores` sans dépendance GCV dans le service partagé |
| `race.js` | Grille, phases, IA, classement ; trois tours du circuit fermé ou une traversée du parcours ouvert |
| `flow.js` | État de l'écran, activité courante et chute, avec transitions contrôlées |
| `session.js` | Entrée dans les modes, reprise, redémarrage, snapshots et autosauvegarde |
| `navigation.js` | Menu, scores en iframe, commandes plein écran et pause liée à la navigation |
| `controls.js` | Clavier, direction tactile, pédales multitouch et remise à zéro des commandes |
| `rendering.js` | WebGL, caméras adaptées au véhicule choisi, transformations et animations des roues |
| `visual-effects.js` | Particules dynamiques de boue et étincelles de friction |
| `hud.js` | Indicateurs de conduite, chrono, classements et panneau d'arrivée |
| `mini-map.js` | Carte ouverte/fermée, départ et arrivée distincts, secteurs et marqueurs dynamiques |

## 3. Flux de simulation

1. À chaque frame active, `game.js` lit les entrées de `controls.js` et calcule la conduite via `physics.js`.
2. `barriers.js` corrige le contact avec les rails ; le suivi du segment de piste utilise les points et tangentes générés par `world-3d.js`.
3. `track-progress.js` projette le déplacement réel sur la tangente, reconnaît le passage géométrique de ligne et produit des événements `start` ou `lap` **validés**. Les indices d'échantillon n'autorisent pas les tours.
4. `lap-times.js` reçoit la progression pour les secteurs et les événements de ligne validés pour le chrono. `race.js` reçoit le même mouvement/les mêmes événements pour les tours, les temps de passage et le classement ; le moteur de course avance aussi les IA.
5. `race.js` reste autoritaire pour ses phases (`staging`, `countdown`, `racing`, `finished`) ; `flow.js` synchronise ces phases et contrôle leur transition. Les axes écran (`menu`, `play`, `scores`) et chute sont indépendants de l'avancement de la course.
6. `hud.js`, `mini-map.js`, `rendering.js` et `visual-effects.js` présentent l'état résultant, sans recalculer les tours.
7. `session.js` extrait des snapshots du même état pour la persistance.

**Invariant clé :** un affichage, un secteur chronométré ou la progression approximative des concurrents ne doit jamais fabriquer un franchissement de tour du joueur. Voir [ADR-0001](adr/0001-progression-des-tours.md).

## 4. Navigation, pause et états

`flow.js` modélise l'écran (`menu`, `play`, `scores`), l'activité (`empty`, `free`, `staging`, `countdown`, `racing`, `finished`) et l'état de chute (`on-track` ou `falling`).

`navigation.js` gère le menu, la reprise, le plein écran et la consultation de `scores.html` dans une iframe dédiée. Ouvrir les scores ou le menu suspend l'avancement du temps simulé, sans effacer les commandes sauvegardées ou changer arbitrairement les tours. `session.js` réalise les bascules de mode et restaure l'état adéquat.

L'unification de cette iframe spécifique avec `shared/score-view.js` reste ouverte dans le [backlog global](../../../docs/BACKLOG.md).

## 5. Persistance

- **Session jetable** : `shared/game-state.js` enregistre `gmr:v1:state:gcv`. Le snapshot inclut notamment caméra, **identifiant de la paire véhicule-pilote**, état de progression, chrono, course/IA et essais éventuellement conservés. `session.js` sauvegarde lors des changements significatifs, environ toutes les 1,5 s de simulation, et sur les événements de fermeture/masquage gérés par `GameState`.
- **Compatibilité des sessions** : `SAVE_REVISION` dans `game.js` et `saveRevision` dans `games/catalog.js` doivent évoluer **ensemble** en cas de rupture ; une ancienne session peut alors être rejetée, puis le menu reste le point d'entrée.
- **Records personnels** : `lap-times.js` enregistre les trois meilleurs temps classiques dans `gmr:v1:gcv:lap-records:v2`, et ceux du parcours Arc-en-ciel dans `gmr:v1:gcv:lap-records:v2:rainbow`, indépendamment des sessions. Une clé/empreinte du tracé conditionne leur validité ; les ajustements de largeur des accotements peuvent rester compatibles.
- **Historique général** : `shared/scores.js` gère séparément `gmr:v1:scores`. L'affichage des records de tours relève de `scores-adapter.js`, déclaré via `scoreScripts` dans `games/catalog.js` et chargé par `shared/scores-page.js` après le service partagé. Le classement d'une course GCV n'est pas actuellement enregistré comme score générique.

Une modification de session ne doit jamais effacer automatiquement les records de tours compatibles ou l'historique général.

## 6. Contrôle qualité

Les tests Node `tests/gcv-*.test.cjs` couvrent notamment la physique, les barrières, le monde 3D, les états de navigation/session, la course et la progression unifiée. La commande globale est `node --test tests/*.test.cjs`.

Le rendu WebGL réel, le plein écran, le multi-touch et les présentations mobiles restent à valider en navigateur ; une automatisation intégrée est prévue dans le backlog. Trois.js est chargé depuis un CDN au démarrage : le fonctionnement hors connexion au premier chargement n'est pas garanti.

Pour les GPU modestes, le parcours ouvert utilise un échantillonnage à 720 segments, des décorations plus légères, un framebuffer plafonné à 750 000 pixels et un rendu sans MSAA. Le circuit classique conserve son niveau de qualité précédent. Les ressources JS/CSS du jeu portent un identifiant de version dans leur URL pour éviter les mélanges de modules mis en cache.

Le parcours est sélectionné via `?track=rainbow` (absence = classique), avec rechargement de la scène et annulation possible des anciennes sessions. `world-3d.js` livre les indices de départ/arrivée au moteur ; `game.js` calcule la longueur entre les deux portes pour la progression/IA tout en conservant la longueur intégrale de spline pour le rendu. Le saut est un écart vertical temporaire qui ne produit aucun événement de course.

Les barrières de la route ouverte ne constituent jamais une boucle de collision : le maillage des côtés est échantillonné moins finement que les collisions, les deux capuchons transversaux sont dessinés par `world-3d.js` aux extrémités réelles et `barriers.js` bloque les franchissements. L'assistance de zigzag exploite une fonction continue et déterministe `SPRINT.zigzagAt` dans `track-layout.js`.
