# GCV — Architecture actuelle

Documentation technique du code situé dans `games/gcv/`. Les règles observables du jeu sont dans [SPECIFICATIONS.md](SPECIFICATIONS.md) ; les améliorations à instruire dans [BACKLOG.md](BACKLOG.md).

## 1. Chargement et orchestration

`index.html` charge les modules JavaScript du jeu dans l'ordre de leurs dépendances. `game.js` est le point d'entrée exécuté comme module ES ; il importe **Three.js 0.180.0** depuis un CDN jsDelivr, construit la scène et démarre la boucle `requestAnimationFrame`.

Il n'existe ni serveur de jeu, ni build, ni moteur physique externe. Les autres fichiers utilisent actuellement les globales `Gcv*` pour le navigateur et, en général, `module.exports` pour les tests Node.

`game.js` monte également `GmrPlayTime` sur la scène pour conserver l'affichage et le blocage en plein écran. Le service commun reçoit un indicateur d'activité issu de `flow` et déclenche le retour au menu lorsque le crédit est épuisé ; il reste indépendant du chrono des tours et des sauvegardes de session.

`game.js` demeure l'**orchestrateur de simulation** : il possède l'état mutable de conduite (position, vitesse, caméra, chute, suivi de progression, chronométrage et course), délègue aux modules spécialisés, puis transmet leur état aux composants d'affichage et à la sauvegarde. La simulation n'est pas pilotée par le rendu.

## 2. Modules par responsabilité

| Module | Responsabilité actuelle |
| --- | --- |
| `track-layout.js` | Constantes du tracé, largeur, accotements, départ/arrivée et échantillonnage |
| `world-3d.js` | Construction Three.js du circuit, de la scène et du décor ; fournit points, tangentes et normales partagés |
| `scenery.js` | Placement et paramètres du décor statique |
| `barriers.js` | Géométrie/limites des rails, résolution de contact, glissement, frottement et réalignement du cap |
| `vehicles.js` | Maillages 3D du joueur, cockpit et neuf concurrents ; marquages de numéros du joueur (n° 9) et des IA issus de `race.js`, avec une texture Canvas par voiture et des décalcomanies positionnées selon leur géométrie |
| `physics.js` | Accélération, frein, direction, marche arrière, chute et émission théorique de boue |
| `track-progress.js` | **Autorité unique** de progression physique et de validation des franchissements de ligne |
| `lap-times.js` | Temps, trois secteurs, deltas et stockage des trois records personnels |
| `race.js` | Grille, phases de départ, trajectoires/vitesses des IA, arrivée et classement |
| `flow.js` | État de l'écran, activité courante et chute, avec transitions contrôlées |
| `session.js` | Entrée dans les modes, reprise, redémarrage, snapshots et autosauvegarde |
| `navigation.js` | Menu, scores en iframe, commandes plein écran et pause liée à la navigation |
| `controls.js` | Clavier, direction tactile, pédales multitouch et remise à zéro des commandes |
| `rendering.js` | WebGL, caméras, transformations et animations visuelles des véhicules |
| `visual-effects.js` | Particules dynamiques de boue et étincelles de friction |
| `hud.js` | Indicateurs de conduite, chrono, classements et panneau d'arrivée |
| `mini-map.js` | Fond de carte précalculé et marqueurs dynamiques du joueur et des concurrents |

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

- **Session jetable** : `shared/game-state.js` enregistre `gmr:v1:state:gcv`. Le snapshot inclut notamment caméra, véhicule, état de progression, chrono, course/IA et essais éventuellement conservés. `session.js` sauvegarde lors des changements significatifs, environ toutes les 1,5 s de simulation, et sur les événements de fermeture/masquage gérés par `GameState`.
- **Compatibilité des sessions** : `SAVE_REVISION` dans `game.js` et `saveRevision` dans `games/catalog.js` doivent évoluer **ensemble** en cas de rupture ; une ancienne session peut alors être rejetée, puis le menu reste le point d'entrée.
- **Records personnels** : `lap-times.js` enregistre les trois meilleurs temps et secteurs sous `gmr:v1:gcv:lap-records:v2`, indépendamment des sessions. Une clé/empreinte du tracé conditionne leur validité ; les ajustements de largeur des accotements peuvent rester compatibles.
- **Historique général** : `shared/scores.js` gère séparément `gmr:v1:scores`. Le classement d'une course GCV n'est pas actuellement enregistré comme score générique.

Une modification de session ne doit jamais effacer automatiquement les records de tours compatibles ou l'historique général.

## 6. Contrôle qualité

Les tests Node `tests/gcv-*.test.cjs` couvrent notamment la physique, les barrières, le monde 3D, les états de navigation/session, la course et la progression unifiée. La commande globale est `node --test tests/*.test.cjs`.

Le rendu WebGL réel, le plein écran, le multi-touch et les présentations mobiles restent à valider en navigateur ; une automatisation intégrée est prévue dans le backlog. Trois.js est chargé depuis un CDN au démarrage : le fonctionnement hors connexion au premier chargement n'est pas garanti.
