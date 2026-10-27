# Grande Course Voiture (GCV) — Spécifications

> **Statut :** spécifications du jeu complet ; prototype de conduite libre v0.1 implémenté (sans concurrents).  
> **Date :** 25 octobre 2026.  
> **Emplacement prévu :** `games/gcv/` dans le monorepo GMR.  
> **Légende :** les sections « Règles demandées » sont des exigences du jeu ; les sections « Pistes techniques » et « À préciser » ne sont pas des décisions de gameplay supplémentaires.

## 1. Concept et objectif — règles demandées

- **Nom :** Grande Course Voiture (**GCV**).
- Jeu de course automobile **3D**, jouable directement dans un navigateur sur téléphone, tablette et ordinateur.
- Courses de voitures de sport, avec une ambiance de racing (inspiration : **Porsche, Ferrari, BMW** et autres marques connues).
- **10 voitures au total** sur le circuit : **1 joueur et 9 concurrents** pilotés par le jeu.
- Chaque voiture porte un **numéro distinct de 1 à 10**.
- Le joueur pilote **toujours la voiture numéro 9** ; aucune voiture pilotée par le jeu ne porte ce numéro.
- La place du joueur sur la **grille de départ est tirée au hasard** à chaque nouvelle course.
- La course se déroule en **5 tours** ; le but est de terminer devant les autres.

## 2. Circuit et environnement — règles demandées

- Circuit fermé, avec **beaucoup de virages**.
- **Grande ligne droite** immédiatement avant la **ligne d'arrivée**.
- À gauche et à droite de la piste se trouvent des **trous / précipices** : une voiture qui sort de la piste peut tomber.
- **Flaques d'eau** placées par endroits sur la piste : elles peuvent provoquer un dérapage.
- **Cailloux et zones de graviers** : ils peuvent aussi faire déraper les voitures.
- Les obstacles doivent être visibles et les pertes d'adhérence compréhensibles pour le joueur.

### Chute et retour en piste

1. Si la voiture du joueur quitte la piste et tombe dans un trou, elle disparaît de la course temporairement.
2. **Deux secondes après la chute**, elle réapparaît **au niveau de l'endroit où elle est tombée**, replacée sur une partie roulable de la piste (pour éviter de retomber immédiatement).
3. Elle **redémarre depuis l'arrêt** : le joueur doit de nouveau accélérer.
4. Pendant ces deux secondes, **les autres concurrents continuent leur course**. Le joueur peut donc perdre des places et devra les rattraper.

## 3. Départ — règles demandées

- Au départ, un **personnage (« bonhomme »)** fait le décompte :
  **« 3, 2, 1, PARTEZ ! »**
- Le décompte apparaît **en gros caractères rouges, en haut et au centre** de l'écran.
- Les voitures restent immobiles tant que le départ n'est pas donné.
- Au signal **« PARTEZ ! »**, la voiture du joueur peut accélérer et les concurrents démarrent.
- La place du joueur sur la grille peut être différente d'une course à l'autre, mais son numéro reste **9**.

## 4. Caméras — règles demandées

- **Vue par défaut : première personne**, à l'intérieur de la voiture / depuis le poste de conduite.
- Le joueur peut **dézoomer** pour obtenir une **vue extérieure** montrant sa voiture.
- Il peut revenir à la vue intérieure pendant la course.
- Le changement de vue est accessible depuis l'interface tactile, sans sortir de la course.

**Piste d'interface (à confirmer) :** un bouton « Caméra » pour alterner entre vue cockpit et vue extérieure. Un zoom plus progressif pourra être étudié ensuite.

## 5. Commandes tactiles — règles demandées

### Côté gauche : direction

- **Petit pavé tactile à gauche** de l'écran.
- Le joueur pose et déplace / maintient son pouce pour **tourner à gauche ou à droite**.
- La direction doit répondre tant que le doigt est maintenu, puis revenir à une position neutre lorsque le doigt est relâché.

### Côté droit : vitesse

- Deux grands boutons séparés :
  - **Accélérer**, généralement **maintenu appuyé**.
  - **Freiner**, utilisé lorsque le joueur souhaite ralentir.
- Les commandes **direction + accélération ou freinage doivent fonctionner simultanément** : prise en charge du **multitouch**.
- Sur mobile, les boutons doivent être assez grands pour être utilisables avec les pouces, sans déclencher de défilement ou de zoom de la page pendant la conduite.

**Piste technique :** utiliser les Pointer Events et `touch-action: none` sur la zone de jeu. Les commandes clavier sur ordinateur peuvent être ajoutées en complément, mais ne remplacent pas les commandes tactiles.

## 6. Affichage pendant la course (HUD) — règles demandées

L'interface est superposée au rendu 3D et doit rester lisible en vue intérieure comme extérieure.

| Élément | Informations |
| --- | --- |
| **Compteur de vitesse** | Vitesse de la voiture du joueur en **km/h** |
| **Classement** | Place du joueur parmi les 10 voitures : **1er/10, 2e/10, 3e/10**, etc. |
| **Mini-carte du circuit** | Tracé simplifié du circuit et **position de la voiture du joueur** sur ce tracé |
| **Tours** | Afficher la progression, par exemple **Tour 2/5** (proposition utile pour une course de 5 tours) |
| **Caméra** | Commande permettant de changer la vue |
| **Plein écran** | Commande pour entrer en plein écran ou en sortir |

- La mini-carte est placée **sur un côté de l'écran**, sans masquer la route.
- Le classement doit refléter l'avancement réel sur le circuit (tours complétés et position sur le tour), pas uniquement la distance à la caméra.
- **Piste d'évolution :** montrer aussi les autres concurrents sur la mini-carte, sans rendre sa lecture confuse.

## 7. Concurrents contrôlés par le jeu — règles demandées

- **9 voitures pilotées par l'ordinateur** contre le joueur numéro 9.
- Elles avancent sur le même circuit, effectuent les mêmes **5 tours** et se disputent le classement.
- Leurs **numéros sont uniques** parmi 1 à 10, à l'exception du 9 réservé au joueur.
- Voitures sportives de formes, couleurs et styles variés, inspirées des catégories de modèles de marques connues.

**Pistes d'implémentation :** IA simple suivant une trajectoire sur le circuit, variations modérées de vitesse, ralentissement dans les virages et gestion des dépassements. Réalisme avancé, logos et modèles sous licence **non nécessaires pour la première version**.

## 8. Fin de course — règles demandées et points à compléter

- Après **5 tours**, le passage sur la ligne d'arrivée marque la **fin de course du joueur**.
- Afficher sa **position finale** sur 10.
- Prévoir une action pour **rejouer** une course.

**À préciser plus tard :** animation / podium d'arrivée, éventuelle récompense, comportement exact des concurrents après l'arrivée du joueur et calcul d'un éventuel score numérique.

## 9. Plein écran — vérification de faisabilité

**Conclusion :** le plein écran de page Web est **pris en charge par Chrome sur Android**. La demande doit être déclenchée par une action du joueur (appui sur un bouton), et reste sujette aux autorisations / limitations du navigateur.

### Fonctionnement attendu

- Bouton **« Plein écran »** sur le jeu, qui agrandit la scène et ses commandes à l'écran entier.
- Bouton **« Quitter le plein écran »** pour revenir à l'affichage habituel.
- Le libellé ou l'icône change selon l'état réel, y compris si le système ou le navigateur quitte le plein écran.
- Si le plein écran est indisponible ou refusé, le jeu reste **jouable dans la page**.
- Le plein écran doit préserver le multitouch, la mini-carte et l'emplacement des commandes.

### APIs envisagées

- `element.requestFullscreen()` sur un conteneur qui englobe **scène 3D + commandes + HUD**.
- `document.exitFullscreen()` pour sortir.
- `document.fullscreenElement` et l'événement `fullscreenchange` pour synchroniser le bouton.
- `document.fullscreenEnabled` pour détecter les possibilités du navigateur, avec gestion des refus.
- **Orientation paysage** conseillée sur téléphone : possibilité de tenter `screen.orientation.lock('landscape')` pendant le plein écran **si autorisé**, avec repli gracieux si la tentative échoue. L'orientation verrouillée n'est pas une condition pour jouer.

Références vérifiées le 25/10/2026 :
- [MDN — Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)
- [MDN — requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)
- [Can I use — compatibilité Fullscreen, notamment Chrome Android](https://caniuse.com/fullscreen)
- [Web Features — verrouillage de l'orientation](https://web-platform-dx.github.io/web-features-explorer/features/screen-orientation-lock/)

**Important :** la prise en charge est documentée ; un test réel sur Chrome Android devra confirmer le rendu du jeu et l'ergonomie tactile quand il existera.

## 10. Technique et graphismes — pistes retenues pour le prototype

- **Three.js** pour une scène 3D simple via **WebGL 2**.
- Graphismes **simples, stylisés / low-poly**, rapides à fabriquer et légers pour les mobiles : circuit en maillage 3D, voitures composées de primitives ou modèles très simples, décor peu chargé.
- **Physique de conduite simplifiée** : direction, accélération, freinage, inertie et coefficient d'adhérence selon l'état de la chaussée. Éviter d'emblée un moteur physique 3D complexe.
- Circuit représenté par une trajectoire fermée réutilisable pour : piste, conduite des IA, calcul du classement, tours, mini-carte et respawn.
- Affichage 3D sur `canvas` avec HUD et commandes HTML/CSS superposés, compatibles avec le plein écran du conteneur.
- Chargement statique compatible avec **GitHub Pages**, comme le site GMR ; pas de serveur de jeu ni de compte nécessaire.
- Cibles : **Chrome Android en priorité**, puis navigateurs modernes de tablette et d'ordinateur.
- Préserver la fluidité sur téléphone et tablette ; réduire la complexité graphique sur les appareils moins puissants.

Documentation : [Three.js — WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer).

## 11. Intégration à GMR — conventions existantes

- Chaque jeu dispose de son répertoire : `games/gcv/`.
- Utiliser si possible les modules communs déjà présents dans `shared/`, en particulier :
  - `game-state.js` : **sauvegarde automatique** et restauration de la partie courante dans `localStorage` ;
  - `scores.js`, `score-view.js` : historique et affichage des résultats si un score exploitable est défini ;
  - `app-confirm.js` : confirmations intégrées au site si nécessaires.
- ID de jeu : **`gcv`** ; ne pas casser les conventions des autres jeux.
- À terme, conserver au minimum : tour, position sur piste, vitesse, numéro 9, positions / progression des concurrents, état de départ, caméra choisie et état de la course. Reprendre sans créer une deuxième voiture numéro 9.
- Ne déclarer GCV dans `games/catalog.js` **que lorsqu'une version jouable existe**. Ce fichier de spécifications ne crée pas encore de jeu dans l'accueil.

## 12. Critères de validation fonctionnels (pour les futures étapes)

- [ ] Course complète de **5 tours**, avec **10 voitures numérotées 1 à 10**, dont **le joueur n° 9**.
- [ ] Position de départ du joueur aléatoire sur la grille.
- [ ] Décompte **3, 2, 1, PARTEZ !** rouge et visible, avec personnage au départ.
- [ ] Vue cockpit par défaut et passage possible à la vue extérieure.
- [ ] Direction au pouce à gauche, accélération et frein à droite, contrôle multitouch.
- [ ] Circuit avec virages, grande ligne droite finale, flaques et graviers / cailloux glissants.
- [ ] Chute en quittant la piste, réapparition **2 secondes après** près du lieu de chute, voiture à l'arrêt, concurrents continuant leur progression.
- [ ] Compteur km/h, classement /10, mini-carte avec position du joueur.
- [ ] Bouton entrée / sortie du plein écran, testé sur **Chrome Android**.
- [ ] Affichage du résultat à l'arrivée et possibilité de rejouer.
- [ ] Sauvegarde locale conforme au fonctionnement commun de GMR, sans gêner l'animation en cours.

## 13. Points à décider ultérieurement (ne bloquent pas le présent document)

- Tracé précis du premier circuit, largeur de la piste et répartition exacte des trous et obstacles.
- Répartition précise des modèles / marques ; formes inspirées ou modèles détaillés.
- Intensité des dérapages, vitesse maximale et difficulté des concurrents.
- Son du départ, moteurs, musique et autres effets sonores.
- Aspect exact du « bonhomme » qui donne le départ.
- Comportement détaillé d'un concurrent IA qui tombe ou dérape.
- Score numérique compatible avec l'historique de GMR (classement seul ou barème).
- Bouton caméra simple ou véritable zoom réglable.

---

## 14. Avancement du prototype (25/10/2026)

**Version v0.1 — jouable en conduite libre :**
- [x] Circuit simple fermé rendu en 3D avec Three.js, ligne de départ et repères visuels.
- [x] Voiture sportive rouge **n° 9**, roues, éclairages et habitacle simplifié.
- [x] Caméra **intérieure par défaut** et bouton de passage en caméra extérieure.
- [x] Pavé tactile analogique à gauche, boutons multitouch accélération / freinage à droite.
- [x] Commandes clavier supplémentaires (WASD et flèches).
- [x] Accélération, freinage, inertie, direction et compteur de vitesse km/h.
- [x] Mini-carte du circuit avec la position du joueur.
- [x] Sortie de piste : chute puis retour à proximité du lieu de chute après **2 secondes**.
- [x] Entrée/sortie du plein écran via l'API du navigateur, avec repli en cas de refus.
- [x] Sauvegarde automatique locale de la position, de la vitesse et de la caméra via `shared/game-state.js`.
- [x] Jeu inscrit au catalogue d'accueil GMR.
- [x] Tests unitaires du module de physique de conduite ajoutés (`tests/gcv-physics.test.cjs`).

**Pas encore réalisés :** les 9 concurrents et leur IA, la grille aléatoire, le décompte, les 5 tours, le classement, les flaques et les graviers, le résultat final et l'enregistrement des scores. Les graphismes et la conduite sont volontairement simples à ce stade.

**Vérifications à faire sur appareils réels :** ergonomie multitouch, fluidité WebGL, fonctionnement de l'API plein écran et aspect de la vue intérieure sur Chrome Android / tablette.

**Fichiers principaux :** `games/gcv/index.html`, `game.css`, `game.js`, `physics.js`. Three.js est chargé depuis un CDN sur une version fixée (`0.180.0`), ce qui nécessite une connexion pour son chargement initial.


## 15. Ajustements du prototype de conduite (25/10/2026)

**Version v0.2 :**

- [x] Remontée des commandes à environ **deux tiers de la hauteur** de la scène, y compris en plein écran, avec une taille légèrement augmentée pour les commandes de direction, d'accélération et de freinage. Ajustement pour les écrans de faible largeur.
- [x] **Bande de graviers de 2 m** de chaque côté de la route : visuel distinct et cailloux simplifiés, décélération supplémentaire et adhérence réduite.
- [x] Chute déclenchée uniquement **au-delà de la bordure externe du gravier** (au lieu de la bordure de la route). Pendant les deux secondes, la voiture **poursuit sa vitesse horizontale** et tombe sous la gravité ; le compte à rebours est démarré au début de la chute. Elle réapparaît ensuite immobile au point sûr le plus proche.
- [x] En **essai libre**, le HUD affiche le **nombre de tours complets effectués**, sans limite de cinq tours. Le compteur s'incrémente en franchissant la ligne dans le bon sens, et les allers-retours sur la ligne ou les réapparitions ne créent pas de faux tours. La course officielle en cinq tours reste à implémenter.
- [x] Direction plus rapide à braquer : vitesse angulaire maximale augmentée de 1,45 à **2,35 rad/s**, avec une réponse effective dès une vitesse plus faible.
- [x] Tests automatisés pour la physique des chutes, l'adhérence et le décompte des tours dans `tests/gcv-physics.test.cjs` et `tests/gcv-track-progress.test.cjs`.

**Reste à valider sur appareil :** l'emplacement physique des boutons sur les différentes tailles de téléphones, les performances du rendu et la sensation de direction.

## 16. Ajustements de conduite et d'habitacle (25/10/2026) — v0.3

- [x] Bandes de graviers élargies de **2 m à 6 m de chaque côté** de la piste. Le test de sortie de piste suit leur nouveau bord extérieur ; les cailloux sont répartis sur toute la largeur.
- [x] Direction rétablie à sa **sensibilité d'origine** : vitesse angulaire maximale **1,45 rad/s** et réponse progressive selon la vitesse comme dans le prototype v0.1.
- [x] Freinage renforcé (**82 m/s²** au lieu de 31, hors résistance au roulement). Il arrête la voiture avant d'engager la marche arrière.
- [x] **Marche arrière lente** : après maintien du frein pendant **0,8 s à l'arrêt**, la voiture recule progressivement jusqu'à environ **14,4 km/h** ; relâcher le frein interrompt l'accélération arrière ; l'accélérateur permet de repartir vers l'avant. La direction s'inverse naturellement en reculant.
- [x] Pédales à droite désormais **superposées**, avec **Accélérer au-dessus de Frein**.
- [x] Compteur de vitesse **plus de deux fois plus grand** ; affichage de la vitesse absolue en km/h et lettre **R** lorsque la marche arrière est enclenchée.
- [x] Rochers de décor **plus gros, remontés et rapprochés de la piste**, en dehors de la zone de graviers.
- [x] Vue intérieure : caméra **fixée rigidement derrière le volant** (aucun lissage ou « élastique »), toit et montants toujours visibles, sans vitre avant pour dégager la vue.
- [x] Faux tableau de bord avec **deux cadrans**, affichage décoratif, volant et structure intérieure. Ces cadrans restent décoratifs ; la vitesse réelle est fournie par le HUD.
- [x] Conservation de la vitesse négative et du temps de maintien de frein dans la sauvegarde locale ; retour à l'arrêt après chute.
- [x] Tests automatisés étendus pour les nouvelles règles de direction, freinage, recul et chute.

**À vérifier en navigateur réel :** qualité du cadrage du volant et du toit en vue intérieure, absence de masquage excessif par le tableau de bord, lisibilité des grands chiffres, interaction des pédales en disposition verticale et ressenti du freinage/recul sur Android.


## 17. Course sur terre et décor maritime (25/10/2026) — v0.4

- [x] **Décor :** les grandes formations rocheuses sont désormais posées sur de **petites îles avec un anneau de sable** ; la base du sable et du rocher pénètre dans le plan d'eau, sans rochers en suspension.
- [x] **Eau :** plan agrandi de 520 × 520 m à **4 200 × 4 200 m**, avec distance d'affichage et brouillard adaptés pour masquer les bords.
- [x] **Cockpit :** volant réduit et abaissé avec tout le faux tableau de bord, toit relevé, fenêtres latérales ouvertes (vitres latérales supprimées, montants conservés), caméra cockpit toujours rigidement solidaire de la voiture.
- [x] **Piste :** terre et boue sur toute la chaussée, plusieurs nuances de brun irrégulières ; aucune bande de bitume ni ligne peinte blanche ou jaune. Accotements de 6 m conservés avec une couleur de terre plus claire. La ligne d'arrivée reste marquée par des dalles de couleurs de terre contrastées.
- [x] **Mini-carte :** nouveau rendu type vue satellite avec mêmes couleurs pour la mer, les îles, les accotements et la piste ; symbole de **ligne d'arrivée**.
- [x] **Performance :** vitesse maximale configurée à **250 km/h**, accélération ajustée pour rendre cette valeur atteignable.
- [x] **Effets :** projections de boue par particules regroupées dans un rendu GPU léger dans les virages rapides, à fort freinage et sur accotements meubles.
- [x] **Feux arrière :** éclairage rouge augmenté automatiquement tant que le joueur freine, y compris avec les commandes au clavier.
- [x] **Tests :** vérifications du plafond de 250 km/h et du freinage depuis la vitesse maximale.

**Tests réels encore requis :** vérifier le cadrage/visibilité du cockpit, les îles, les projections de boue et l'apparence satellite sur Chrome Android après le déploiement GitHub Pages.


## 18. Rochers immergés et comportement sur terre (25/10/2026) — v0.5

- [x] Suppression des petites plages, anneaux de sable et socles autour des rochers : les **rochers plongent directement dans l'eau**.
- [x] Correction du rocher situé sur la chaussée : le placement vérifie désormais la distance à **tous les tronçons du circuit**, y compris les tronçons proches mais non adjacents, ainsi qu'aux autres rochers. Un rocher impossible à placer correctement est omis. Vérifié par des tests spécifiques.
- [x] L'aspect visuel de la piste reste en **terre/boue**, mais les **caractéristiques de conduite redeviennent celles d'une piste goudronnée**, y compris sur les accotements : suppression de la pénalité d'accélération/adhérence sur la terre latérale. Conservation de la direction, du freinage, de la marche arrière et de la vitesse maximale déjà établis (250 km/h).
- [x] Particules de boue **uniquement dans les virages extrêmement appuyés à vitesse élevée**, avec seuil sur la vitesse, l'intensité du braquage et l'accélération latérale estimée. Le simple freinage, la marche normale et l'utilisation des accotements n'en produisent plus.
- [x] Mini-carte sans plages, montrant uniquement les rochers sur l'eau.
- [x] Ajout des tests de placement des rochers et révision des tests de physique/émission des particules.

**À contrôler sur navigateur :** disposition finale des rochers, visibilité des structures rocheuses à la ligne d'horizon et sensations de conduite dans les virages.


## 19. Circuit allongé, piste épaisse et chute immédiate (26/10/2026) — v0.6

- [x] **Circuit environ deux fois plus long** : le périmètre approximatif de la ligne médiane passe de 389 m à 812 m (× 2,09), en conservant plusieurs virages.
- [x] **Grande ligne droite de 240 mètres** ; **ligne d'arrivée située aux deux tiers** de cette ligne, soit à 160 m de son début. Le joueur commence sur cette même ligne droite, après la ligne d'arrivée, pour réaliser un tour complet.
- [x] **Piste en volume** : le ruban de terre et ses accotements possèdent maintenant des parois latérales et une face inférieure, sur environ **4,8 mètres d'épaisseur**, pour être visibles depuis le vide.
- [x] **Chute immédiate** : dès la sortie de piste, la voiture acquiert une vitesse verticale de **−7 m/s**, en plus de la gravité ; le premier pas de chute est appliqué dès la frame de sortie, tout en conservant l'inertie horizontale et le retour après 2 secondes.
- [x] **Direction tactile plus haute** : le pavé a une hauteur de 148 px sur téléphone (120 px en mode paysage compact), avec une surface proportionnellement plus haute sur les autres écrans.
- [x] **Adaptation des éléments de piste** à 840 points d'échantillonnage, pour conserver la finesse du contour, du gravier et des taches de boue sur le circuit allongé.
- [x] **Progression sauvegardée versionnée** : les sauvegardes de l'ancien tracé sont incompatibles et une nouvelle session de conduite libre démarre sur la nouvelle piste ; les scores déjà enregistrés ne sont pas affectés.
- [x] Ajout de tests de configuration du circuit (longueur, fraction de ligne droite, position de départ), ainsi que d'un test vérifiant la descente verticale sans flottement initial.

**À confirmer sur appareils réels** : perception de l'épaisseur depuis les bordures, vue sur la grande ligne droite, précision de la mini-carte et ergonomie du pavé de direction en plein écran.


## 20. Chronomètre de tours, secteurs et records (26/10/2026) — v0.7

- [x] **Chronomètre en haut au centre** : affichage MM:SS.cc du tour en cours ; le chronométrage commence après le premier franchissement de la ligne d'arrivée dans le bon sens. Le premier tronçon incomplet, entre la grille et ce premier passage, ne produit pas de record.
- [x] **Trois points intermédiaires** : S1, S2 et S3 aux 25 %, 50 % et 75 % du tour après la ligne d'arrivée. Les marqueurs correspondants apparaissent sur la mini-carte.
- [x] **Delta de temps à droite du chrono** : comparaison de la durée cumulée de chaque secteur avec celle du meilleur tour enregistré ; **vert** si plus rapide, **rouge** si plus lent, teinte neutre si identique ou sans référence.
- [x] **Trois meilleurs chronos sous la vitesse et le nombre de tours** ; tri par temps croissant et conservation automatique uniquement des trois records les plus rapides avec les temps intermédiaires.
- [x] **Page de scores existante** : onglet GCV et page générale affichent le classement des trois meilleurs tours et leurs trois temps intermédiaires ; lien « Scores » depuis le jeu.
- [x] **Sauvegarde locale** : les temps records sont enregistrés sur l'appareil dans `gmr:v1:gcv:lap-records`. Le chrono en cours, les trois secteurs déjà passés et le nombre de tours chronométrés sont sauvegardés avec la partie.
- [x] **Remise à zéro automatique au changement du circuit** : empreinte basée sur les points du tracé, départ/arrivée, nombre d'échantillons, largeur de piste et des accotements, et version du layout. Si elle change, les chronos et la session GCV précédente sont réinitialisés. Les scores des autres jeux sont inchangés.
- [x] **Sécurité contre les faux tours** : tours uniquement complets dans le bon sens avec passage successif aux trois points intermédiaires ; une chute annule le tour partiel et impose de repasser la ligne d'arrivée pour reprendre le chrono.
- [x] **Marche arrière** : vitesse maximale doublée de 4 à **8 m/s**, soit **28,8 km/h**. Les autres réglages de conduite sont conservés.
- [x] Tests unitaires des records, du tri, de la restauration, du delta, des trois secteurs et de l'invalidation lorsque le circuit est modifié.

**À valider en navigateur mobile :** placement du chronomètre en haut au centre (portrait/paysage), lisibilité des deltas et de la mini-carte, affichage des résultats sur la page Scores et suivi du chrono pendant une partie réelle.


## 21. Correction de la ligne d'arrivée et bouton de redémarrage (26/10/2026) — v0.8

- [x] **Déclenchement du chrono corrigé** : auparavant le chrono attendait le franchissement d'un index discret de la piste (840 échantillons) ; un franchissement réel pouvait être manqué.
- [x] **Détection géométrique** : on contrôle le déplacement réel entre deux frames par rapport à la **ligne d'arrivée visible**, dans le bon sens et dans la largeur autorisée. Le temps exact du franchissement est interpolé dans la frame.
- [x] **Tours valides** : le départ du chrono et la validation de la fin de tour n'utilisent plus le seul index du tracé. Les trois intermédiaires doivent avoir été passés ; la marche arrière et le passage hors piste ne valident rien.
- [x] **Resynchronisation** : lors d'un véritable franchissement, la progression virtuelle est réalignée sur l'index du nouveau tour, pour que les points intermédiaires restent fiables.
- [x] **Bouton « ↻ Départ »** : replacer et orienter la voiture à **10 mètres avant la ligne d'arrivée**, vitesse nulle, chrono et nombre de tours de la tentative remis à zéro, chute interrompue, sans passage ni tour artificiel. Les trois meilleurs temps existants sont **conservés**.
- [x] Tests du franchissement rapide entre deux images, du passage inverse et hors circuit, de la resynchronisation et du franchissement avec trois secteurs.
- [x] Réagencement des boutons supérieurs pour éviter de masquer le chronomètre.

**À contrôler sur Chrome Android :** apparence du bouton Départ, remise en place à 10 mètres et déclenchement effectif du chrono au franchissement.


## 22. Chute sans remise à zéro du chronomètre (26/10/2026) — v0.9

- [x] Une chute n'invalide **plus** le tour chronométré en cours. Le joueur garde son temps cumulé, ses trois points intermédiaires déjà franchis et le delta affiché.
- [x] Le temps continue à avancer pendant toute la chute et le retour automatique (environ 2 secondes) ; cette durée constitue la pénalité naturelle du joueur.
- [x] Le retour sur piste conserve l'avancement du tour sans comptabiliser de raccourci ou de point intermédiaire artificiel lié au déplacement de respawn.
- [x] La sauvegarde locale conserve désormais le chronomètre même si elle survient au milieu d'une chute. Le rechargement reprend au point de retour sûr sans perdre le temps déjà accumulé.
- [x] Les comportements intentionnels de remise à zéro sont conservés : changement de circuit et bouton « ↻ Départ ».
- [x] Tests ajoutés : conservation des secteurs et du delta, prise en compte des 2 secondes dans le temps final, arrêt du chrono avant son premier départ et restauration d'un tour en cours après une chute.

**À vérifier sur Android :** continuité visuelle du chronomètre pendant les deux secondes de chute et juste après réapparition.


## 23. Premier mode Course contre 9 IA (26/10/2026) — v0.10

- [x] **Deux modes distincts** : `Essais libres` garde le fonctionnement précédent (chronomètre, secteurs, records personnels, chute avec pénalité naturelle) ; `Course · 2 tours` lance une course de 10 véhicules.
- [x] **10 voitures au total** : la voiture n° 9 du joueur et **9 concurrents IA** (correction de la demande initiale de 19 concurrents).
- [x] **Grille de départ** : cinq rangées de deux voitures, départ au milieu de la grille en **5ᵉ position sur 10**, alignement derrière la ligne d'arrivée et légèrement décalé latéralement.
- [x] **Compte à rebours** : 3, 2, 1 ; le joueur et les neuf IA attendent le feu vert avant de rouler.
- [x] **IA très faciles** : neuf voitures colorées suivant la ligne de la piste à environ **29–43 km/h**, contre un maximum de 250 km/h pour le joueur. Première version sans gestion élaborée des collisions ou des dépassements.
- [x] **Deux tours complets** : classement par distance parcourue sur la piste et arrivée lorsque le joueur a achevé deux tours ; panneau final avec position, temps total et commandes Rejouer / Essais libres.
- [x] **HUD** : position courante du joueur près du compteur de vitesse (ex. 5ᵉ / 10), compteur de tours et état du mode courant ; concurrents matérialisés sur la mini-carte.
- [x] **Conservation de l'essai libre** : la partie en essais libres est conservée lors du passage temporaire au mode Course, puis restaurée au retour. Les records de temps au tour ne sont pas remis à zéro par le changement de mode.
- [x] **Sauvegarde automatique** : l'état de la course (phase, décompte, progression, adversaires, classement final) et l'état des essais libres précédents sont conservés localement sur le même appareil.
- [x] Tests sans dépendance graphique de la taille de grille, du départ au milieu, du compte à rebours, de la vitesse des IA, de la durée de deux tours, des positions et de la sauvegarde.

**À contrôler visuellement sur mobile** : lisibilité des boutons de mode et du classement, voiture et IA sur la grille, compte à rebours, deux franchissements complets, panneau de résultats et restauration des essais libres.


## 24. Accueil intégré, modes en plein écran et IA calibrées (26/10/2026) — v0.11

- [x] **Adversaires plus rapides** : 9 voitures IA calibrées sur les temps de tour cibles **35, 36,875, 38,75, 40,625, 42,5, 44,375, 46,25, 48,125 et 50 secondes**. La vitesse linéaire est calculée à partir de la longueur *réelle* du circuit (courbe de Three.js), de sorte que les temps visés restent stables après une future modification du tracé.
- [x] **Migration des courses enregistrées** : les parties déjà sauvegardées avec l'ancienne lenteur des IA sont recalibrées automatiquement au rechargement ; la position des voitures est conservée.
- [x] **Véritable écran d'accueil de GCV** : visible dès l'ouverture du jeu, avec présentation, boutons **Essais libres** / **Course · 2 tours**, reprise de la partie sauvegardée, accès aux scores et activation du plein écran.
- [x] **Choix du mode depuis le plein écran** : tout le menu est dans l'élément `gcv-stage` qui devient plein écran. Le bouton **☰ Menu** pendant le jeu revient à l'accueil sans quitter le plein écran ni perdre la partie.
- [x] **Pause du jeu dans le menu** : la physique de conduite, le compte à rebours et les adversaires ne progressent pas lorsque le menu ou les scores sont ouverts ; le bouton **Reprendre** relance l'état précédent.
- [x] **Scores utilisables en plein écran** : le classement GCV est ouvert dans une iframe intégrée à `gcv-stage` ; le bouton Retour ferme les scores sans sortir du jeu ni du plein écran.
- [x] **Plein écran disponible dans l'accueil et pendant le jeu** : boutons indépendants affichant correctement l'état du plein écran, fonction commune de bascule compatible avec le menu.
- [x] **Ergonomie** : accueil adaptatif aux écrans portrait/paysage, disposition compacte des commandes du HUD sur téléphone, label du mode de jeu conservé.
- [x] **Tests automatisés** : temps de tour des neuf IA, classement, sauvegarde et migration des vitesses d'une partie précédemment enregistrée ; contrôle des références DOM et de la syntaxe JavaScript.

**Tests réels à effectuer** : menu d'accueil sur Chrome Android en plein écran portrait/paysage, changement de mode sans sortie du plein écran, pause/reprise d'un compte à rebours, page des scores et fermeture via le bouton Retour.


## 25. Difficulté IA avancée et attente de départ (26/10/2026) — v0.12

- [x] **Temps des meilleurs adversaires** : trois pilotes rapides ciblent des temps aléatoires dans les intervalles **16–18,5 s**, **18,5–21 s** et **21–24 s** par tour.
- [x] **Milieu du classement** : quatre concurrents supplémentaires ciblent **26–29 s**, **30–33 s**, **34–36 s** et **37–38 s**.
- [x] **Deux derniers concurrents** : leurs temps visés restent dans **39–39,5 s** et **39,5–40 s**.
- [x] **Aléatoire à chaque nouvelle course** : les neuf temps cibles sont tirés aléatoirement dans leur plage de difficulté ; les vitesses sont calculées à partir de la longueur réelle du circuit, puis restent stables au cours de cette course et lors de sa sauvegarde / restauration.
- [x] **Menu sans divulgation des temps** : le bouton « Course · 2 tours » décrit simplement le défi contre neuf concurrents et ne dévoile pas leurs temps cibles.
- [x] **Deux secondes d'attente sur la grille** : une phase de préparation (« Prépare-toi ! ») de 2 secondes précède le décompte traditionnel **3, 2, 1**, puis le feu vert et le déplacement des voitures.
- [x] **Masquage fiable des panneaux** : les éléments de préparation, de décompte, de résultats, d'accueil et de scores respectent explicitement leur attribut `hidden`.
- [x] **Sauvegardes existantes** : les anciens adversaires d'une course sauvegardée sont recalibrés automatiquement vers la nouvelle difficulté ; les records et essais libres restent inchangés.
- [x] Tests automatisés des bornes de temps, de l'aléatoire, de la préparation de 2 s et des 3 s du compte à rebours, ainsi que des transitions en cas de frame lente.

**À valider visuellement dans Chrome Android** : phase de préparation de 2 s, décompte, disparition de l'overlay au démarrage et bon déroulement de deux tours.


## 26. Trois adversaires de tête plus rapides (26/10/2026) — v0.13

- [x] Les trois pilotes IA les plus rapides visent désormais, avec une part aléatoire à chaque course, **15–16 s**, **16–17 s** et **17–18 s** par tour.
- [x] Les quatre adversaires intermédiaires (26–38 s) et les deux derniers (39–40 s) restent inchangés.
- [x] La vitesse est adaptée automatiquement à la longueur réelle du tracé ; la vitesse d'un pilote reste stable dans la même course, y compris après rechargement de la sauvegarde.
- [x] Les anciennes courses sauvegardées passent aux nouvelles plages si leur temps cible n'est plus valide. Le menu ne révèle pas les temps de référence.
- [x] Tests unitaires des nouvelles plages individuelles et de la restauration.



## 27. Fin de tour et classement final complet (26/10/2026) — v0.14

- [x] **Annonce de fin de tour (mise à jour section 28)** : chaque tour terminé affiche son temps directement dans le chronomètre du haut, et non dans un panneau central. Si ce résultat entre dans le classement des trois meilleurs tours enregistrés, une mention discrète **1er, 2e ou 3e meilleur temps** apparaît sous le chronomètre. Le classement est calculé avant l'insertion du nouveau record.
- [x] **Chrono de l'en-tête** : la durée du tour terminé remplace le chrono en cours pendant **2 secondes**, avec clignotement ; le chronomètre actif continue en arrière-plan et reprend son affichage après ce délai. Aucun panneau central supplémentaire n'apparaît.
- [x] **Mode Course** : durée de chacun des deux tours mesurée avec interpolation dans les frames. Si un tour n'a pas donné lieu à un enregistrement chronométré (ex. points intermédiaires manquants), la course affiche tout de même sa durée à l'issue du tour, sans inventer un nouveau record.
- [x] **Écran final complet** : tableau de **10 voitures** avec position, numéro, temps final, et écart temporel vis-à-vis du concurrent immédiatement précédent. Le joueur n°9 bénéficie d'une ligne plus grande, contrastée et mise en évidence.
- [x] **Concurrents derrière l'écran de résultat** : après l'arrivée du joueur, sa position et son temps sont verrouillés mais les autres voitures **poursuivent leur course 3D** jusqu'à leur propre arrivée. Le tableau se met à jour en direct au fur et à mesure ; seules les voitures ayant réellement terminé reçoivent un temps et un delta, les autres affichent « En course… ».
- [x] **Classement précis** : le résultat est trié par temps d'arrivée réel avec interpolation des instants de passage, et non par distance finale identique pour tous. Les résultats sont conservés dans les sauvegardes, ainsi que les temps des deux tours et l'arrivée de chaque IA.
- [x] **Flaques décoratives** : 19 flaques d'eau irrégulières bleu-gris avec petites réflexions, créées en deux lots instanciés sur la chaussée. Elles ne changent **ni l'adhérence, ni la vitesse, ni la physique**.
- [x] Tests automatisés de l'ordre d'arrivée, des écarts successifs, de l'arrivée retardée des IA, des deux temps de tour du joueur, des sauvegardes et du classement des meilleurs chronos.

**À confirmer sur navigateur réel** : présentation des panneaux sur tablette et téléphone, clignotement exact du chrono, lisibilité du tableau en paysage et aspects des flaques sur la piste.


## 28. Suppression du panneau central de fin de tour (26/10/2026)

- [x] Supprimer totalement le gros panneau de fin de tour au centre de la piste (HTML, code JavaScript, CSS).
- [x] Afficher exclusivement le **temps du tour achevé** à la place de l'horloge de la zone chronomètre en haut, **pendant deux secondes**.
- [x] Faire clignoter uniquement ce temps dans son emplacement habituel ; laisser le chrono réel tourner en arrière-plan, puis reprendre la mesure du tour en cours.
- [x] Lorsque le temps est dans les trois meilleurs, afficher une mention discrète sous ce chronomètre, sans panneau supplémentaire.
- [x] Lors du second tour de course, retarder l'écran final de ces deux secondes, puis afficher les résultats complets.
- [x] Conserver tous les autres mécanismes de jeu, les sauvegardes et les records.

**Vérification** : 80 tests automatisés réussis, avec contrôle des références DOM et de l'absence de l'ancien panneau. Test visuel sur téléphone encore nécessaire.


## 29. Ralentissement des trois IA de tête (26/10/2026)

- [x] Corriger la demande précédente : **ralentir**, et non accélérer, les trois meilleurs adversaires. Leurs temps cibles sont désormais **17–18,5 s**, **18,5–20 s** et **20–21 s** par tour (ensemble **17 à 21 s**).
- [x] Garder les six autres adversaires inchangés, notamment les deux derniers à **39–40 s**.
- [x] Conserver la part aléatoire à chaque nouvelle course et mettre à niveau les vitesses des trois meilleurs pilotes dans les parties sauvegardées.
- [x] Maintenir ces durées indicatives invisibles depuis le menu du jeu.
- [x] Vérifier les bornes des nouvelles plages et le fonctionnement des autres tests.


## 30. Barrières aux sorties de virages et progression des IA (26/10/2026)

- [x] **Barrières des deux côtés de la piste** : identifier toutes les sorties de virage marquées (angle de direction supérieur à 18° entre les trois waypoints voisins) ; protéger chacune d'elles sur **40 mètres**, donc plus que les 30 mètres demandés.
- [x] **Position avant la chute** : les rails sont placés sur la largeur externe de l'accotement, à 0,45 m du bord, avec environ 1,05 m de réserve pour la carrosserie.
- [x] **Rendu 3D** : deux lisses horizontales métalliques et des poteaux sur les deux côtés, regroupés en une géométrie continue et un lot instancié de poteaux pour préserver les performances sur tablette/téléphone.
- [x] **Collision de glissement** : au contact d'un rail, limiter la composante latérale sortante du déplacement sans supprimer la composante longitudinale, la direction ou la vitesse. La voiture continue à longer la barrière au lieu de tomber ; les sorties non protégées continuent de déclencher la chute habituelle.
- [x] **Adversaires mieux équilibrés** : préserver les trois leaders (17 à 21 s par tour à vitesse de croisière), puis six IA de plus en plus lentes sur les nouvelles plages **21,5–23,5 s**, **23,5–25,5 s**, **25,5–27,5 s**, **27,5–29,5 s**, **30–32 s** et **32–34 s**.
- [x] **Départ réaliste des IA** : au lieu de démarrer instantanément à leur vitesse de croisière, toutes les IA commencent à l'arrêt et accélèrent à **10 m/s²**, en dessous de l'accélération initiale du joueur (environ 23,6 m/s²). Cette accélération ajoute naturellement du temps à leur premier tour.
- [x] **Temps précis** : intégration temporelle analytique de l'accélération, puis de la vitesse de croisière, donnant les mêmes positions et instants d'arrivée indépendamment du nombre de frames.
- [x] **Sauvegardes existantes** : conserver les positions des voitures dans les courses reprises et recalibrer une seule fois les anciennes plages de vitesse en fonction des nouvelles.
- [x] **Tests** : longueur minimale des rails, virages, segments non protégés, collision latérale bilatérale, conservation du mouvement longitudinal, variation de vitesse entre IA, comparaison de l'accélération avec le joueur et indépendance vis-à-vis de la fréquence d'image.

**À vérifier sur appareil** : apparence des barrières et continuité visuelle autour des virages, glissement fluide à vitesse élevée, visibilité depuis les vues cockpit et extérieure, adaptation du HUD et de la mini-carte.


## 31. Accotements élargis et barrières continues (26/10/2026)

- [x] **Accotements +4 m de chaque côté** : passage de **6 m à 10 m** autour de la chaussée (largeur totale chaussée + accotements : 38 m, au lieu de 30 m). La piste roulable centrale et le tracé restent inchangés.
- [x] **Deux barrières en continu** : rails métalliques et poteaux sur **100 % du périmètre fermé**, intérieur et extérieur, sans interruption dans les lignes droites ni aux raccords de fin/début de tour.
- [x] **Collision partout** : chaque segment de piste est protégé sur les deux bords ; la voiture reste sur les accotements, contre le rail, au lieu de tomber.
- [x] **Glissement conservé** : la voiture garde sa vitesse, sa direction et son mouvement tangent à la piste. Seul le dépassement latéral de la barrière est corrigé.
- [x] **Performances** : rails regroupés dans une géométrie commune et poteaux regroupés dans un `InstancedMesh`, sans créer un objet individuel par barrière.
- [x] **Compatibilité des sauvegardes** : les temps et parties sauvegardés avant cet élargissement sont repris, car le centre du circuit, la ligne d'arrivée et les distances de tour n'ont pas changé. Les clés de records sont migrées, sans effacer les trois meilleurs tours.
- [x] **Tests** : couverture complète des barrières (y compris le raccord), glissement dans les deux sens, collision répétée, sécurité du véhicule, accotement de 10 m, et migration des records entre anciennes et nouvelles largeurs.

**À contrôler visuellement** : raccord des rails autour de toute la boucle sur téléphone et tablette et comportement du véhicule appuyé contre la barrière dans un virage serré.


## 32. Accotements 7 m, rails anti-croisement et direction corrigée (27/10/2026)

- [x] **Largeur** : accotements ramenés de 10 à **7 mètres par côté**, soit largeur totale **32 mètres** (chaussée centrale de 18 m + 2 × 7 m d'accotements). Le centre du circuit et ses distances de tour restent inchangés.
- [x] **Rails continus des deux côtés** : conserver 100 % de couverture sur les deux bords, y compris les lignes droites et le raccord de boucle.
- [x] **Virages serrés** : corriger les croisements de barrières observés à l'intérieur des courbes. Pour chaque côté, adapter l'écartement selon le rayon de courbure local, adoucir les transitions, puis détecter les intersections de segments de rails non adjacents ; rapprocher progressivement du centre du tracé uniquement les portions qui se croisent. La géométrie des lisses et des poteaux et les limites de collision proviennent des **mêmes points de rail**.
- [x] **Glissement sans braquage vers le mur** : au contact, conserver la vitesse et le déplacement tangentiel, mais supprimer la composante de cap qui pointe vers la barrière. Le joueur peut toujours volontairement orienter sa voiture vers le centre de la piste. Gérer les deux côtés et la marche arrière.
- [x] **Accueil** : boutons « Scores » et « ⛶ Plein écran » en **haut à droite** du jeu, comme les commandes pendant la course, au-dessus de la carte d'accueil ; adapter l'espacement à l'écran paysage d'une tablette ou d'un téléphone.
- [x] **Compatibilité des records** : ne pas effacer les meilleurs tours ni les sauvegardes lors du retour de 10 à 7 m d'accotement. Continuer d'invalider uniquement les données si le centre du circuit ou la ligne de départ changent.
- [x] **Tests** : largeur 7 m, contacts gauche/droite, absence de rotation vers la barrière, conservation des vitesses et du glissement, géométrie d'un virage très serré, intersections sur une approximation de l'ensemble du circuit, migration des chronos.

**Validation visuelle sur appareil à faire** : contact continu de la carrosserie avec les rails dans les virages serrés et présentation des boutons de l'accueil en portrait et en paysage.


## 33. Alignement progressif des collisions contre les barrières (27/10/2026)

- [x] En cas de collision, corriger uniquement le dépassement latéral : la voiture conserve sa vitesse et continue à glisser le long du rail.
- [x] Orienter progressivement le cap vers la **tangente de la barrière 3D réelle**, même si le joueur maintient le braquage contre le rail. L'interpolation exponentielle dépend du temps de simulation et reste fluide.
- [x] Garantir, dès le premier contact, que l'orientation reste dans l'hémisphère du **sens de la course**, y compris si la voiture arrivait à contresens ou si le rail est très déformé dans un virage serré. Aucun retournement ne doit être produit par la collision.
- [x] Garder la liberté de braquer vers l'intérieur pour quitter la barrière : hors collision, aucune correction de direction n'est appliquée.
- [x] Propager l'angle corrigé au véhicule dans la boucle principale (il était auparavant calculé mais non appliqué).
- [x] Vérifications automatisées : **17 tests de barrières**, dont braquage maximal maintenu à gauche/droite pendant 180 images, progression longitudinale, alignement progressif, tangente réelle du rail et virage extrême sans demi-tour.

**À confirmer visuellement sur mobile/tablette** : fluidité du réalignement contre un rail à pleine vitesse et trajectoires en virages serrés.
