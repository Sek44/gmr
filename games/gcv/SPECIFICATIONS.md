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