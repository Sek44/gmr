# Grande Course Voiture — Spécifications fonctionnelles

Ce document décrit les **règles actuelles** du jeu GCV, et non les étapes de développement ou les fonctionnalités envisagées. Pour les choix de conception, voir [ARCHITECTURE.md](ARCHITECTURE.md) ; pour les travaux ouverts, voir [BACKLOG.md](BACKLOG.md).

## 1. Présentation

GCV est un jeu de course automobile en 3D, jouable dans un navigateur sur téléphone, tablette et ordinateur. Le joueur conduit la **voiture n° 9** sur un circuit fermé et sinueux. Deux activités sont disponibles depuis le menu : **Essais libres** et **Course (3 tours)**.

Au premier lancement, la caméra est extérieure. Le joueur peut basculer entre les vues extérieure et intérieure (cockpit) en cours de jeu. Le choix de caméra est conservé lors de la reprise d’une session sauvegardée.

## 2. Circuit, conduite et barrières

- La chaussée a une largeur de **18 m** et les accotements de **7 m de chaque côté**. La piste présente un aspect terre/boue, avec une grande ligne droite et une ligne d'arrivée matérialisée.
- Le circuit est entouré d'eau et de formations rocheuses ; des flaques, cailloux et détails de sol sont visibles. Dans la version actuelle, **les flaques et les accotements ne changent pas l'adhérence** : la conduite est volontairement simplifiée, de type route goudronnée.
- Des barrières sont disposées continûment de chaque côté du circuit. Au contact, la voiture glisse le long du rail, son cap s'aligne progressivement dans le sens de la course et elle ralentit ; la vitesse en frottement est plafonnée à **100 km/h**. Le contact ne doit pas la retourner.
- Vitesse maximale en marche avant : **250 km/h**. Accélération, inertie, freinage et direction sont simulés ; maintenir le frein après l'arrêt permet d'engager une marche arrière limitée à **28,8 km/h**.
- Si la voiture quitte la zone roulable et tombe, elle chute immédiatement puis réapparaît environ **2 secondes** plus tard près de sa sortie, sur la piste, à l'arrêt. Le chrono continue et les concurrents avancent pendant cette absence. Le repositionnement n'ajoute pas artificiellement de progression ni de secteur.

## 3. Commandes et affichage

- Sur écran tactile, la direction se contrôle à gauche ; les boutons d'accélération et de freinage sont à droite. Direction et pédales sont utilisables **simultanément** (multitouch).
- Le clavier constitue une commande alternative sur ordinateur.
- Le HUD affiche la vitesse en km/h, le mode, les tours, le chrono en cours, l'écart chronométrique par rapport au meilleur tour et les **trois meilleurs temps**.
- La mini-carte représente le circuit et la position du joueur ; en course, elle affiche aussi les concurrents. Elle indique la ligne d'arrivée et les trois points intermédiaires.
- Le bouton plein écran est disponible depuis le menu et pendant la conduite. Si le navigateur refuse le plein écran, le jeu reste jouable en page normale.
- Les commandes compactes et le HUD s'adaptent aux présentations portrait et paysage.

## 4. Essais libres et records

- Les essais libres permettent de conduire sans limite fixe de tours et de battre ses temps personnels.
- Le chronométrage d'un tour commence au **premier franchissement valide** de la ligne d'arrivée dans le bon sens : le tronçon entre la position initiale et ce premier passage n'est pas enregistré comme tour complet.
- Trois points intermédiaires situés à **25 %, 50 % et 75 %** du circuit alimentent les écarts avec le meilleur tour. Un tour enregistré comporte un temps total et les trois temps intermédiaires valides.
- Seuls les **trois meilleurs tours**, classés du plus rapide au plus lent, sont conservés localement. Les records sont associés au tracé : un changement incompatible du circuit peut les invalider.
- La chute n'efface pas le tour chronométré en cours ; sa durée fait partie du temps total.
- L'action « Départ » réinitialise la tentative près de la ligne d'arrivée, sans effacer les records.

## 5. Mode Course

- Dix voitures participent : **le joueur n° 9 et neuf concurrents**, portant chacun un numéro distinct de 1 à 10. Toutes les voitures, y compris celle du joueur, affichent leur numéro avec le même graphisme contrasté sur le toit, le capot, les deux portières et l’arrière. Les marquages sont ajustés à la carrosserie de chaque modèle et ne dépendent pas du classement.
- La grille possède cinq rangées de deux voitures ; le joueur démarre actuellement en **5ᵉ position**.
- Les véhicules attendent sur la grille, puis un décompte **3, 2, 1** précède le départ. Aucun véhicule ne démarre avant la fin du décompte.
- Les neuf concurrents suivent le circuit avec un rythme propre tiré aléatoirement au début de chaque course. Leurs **temps de tour cibles de croisière**, hors accélération initiale, se répartissent en secondes dans les plages suivantes : **13–14,5 ; 14,5–16 ; 16–17 ; 17,5–19,5 ; 19,5–21,5 ; 21,5–23,5 ; 23,5–25,5 ; 26–28 ; 28–30**. Ils partent de l'arrêt et accélèrent progressivement.
- Le classement en direct compare la progression physique du joueur et celle des concurrents sur la piste, et actualise les positions lors des dépassements.
- Le joueur termine après **trois tours réellement validés**. La fin ne peut pas être déclenchée uniquement par un compteur de distance ou l'approximation d'une position.
- L'écran d'arrivée affiche la position, le temps du joueur et le classement des dix voitures. Les concurrentes non arrivées continuent la course. L'écart des voitures arrivées est mesuré **par rapport au premier arrivé**, et « — » est affiché quand aucun écart n'est applicable.
- Il est possible de rejouer une course ou de revenir aux essais libres.

## 6. Règles de validation des tours et du classement

- Un tour résulte d'un **franchissement géométrique réel** de la ligne visible dans le bon sens, dans la largeur autorisée, après une progression longitudinale suffisante (**au moins 75 %** de la longueur de la piste depuis le passage valide précédent).
- La progression tient compte du déplacement longitudinal signé ; marche arrière, oscillations près de la ligne, décalages latéraux et sauts d'échantillon dans les épingles ne donnent pas de tours.
- Les tours du mode course, le HUD et le chronométrage prennent leurs franchissements dans la **même** progression validée. Les secteurs servent aux statistiques chronométrées, pas à décider de l'arrivée d'une course.
- Une chute, un retour sur piste ou un redémarrage ne peuvent pas inventer un passage de ligne.

## 7. Navigation et données locales

- Le temps de jeu quotidien est partagé par tous les jeux GMR. Chaque exercice xfr1 validé donne actuellement 10 minutes. Seules les phases de jeu actives consomment du temps ; le menu, les scores, les onglets masqués et une course terminée sont exclus. Le temps restant est affiché, et à épuisement la session est mise en pause dans le menu jusqu'à l'obtention de crédits supplémentaires. Crédit et consommation repartent à zéro chaque jour local.
- Le menu permet de commencer les essais, lancer une course, reprendre la session disponible, accéder aux scores et activer le plein écran. Le retour au menu ou la consultation des scores ne doit pas faire avancer le temps du jeu.
- La consultation des scores se fait sans perdre la session actuelle. Lors d'un passage des essais à la course, une session d'essais antérieure peut être retrouvée au retour.
- La partie en cours est sauvegardée localement et peut être reprise si son format reste compatible. **Une mise à jour incompatible peut annuler les anciennes courses ou essais et revenir au menu** ; il n'est pas nécessaire de migrer ces sessions.
- Les meilleurs tours et l'historique de scores sont séparés des sauvegardes de sessions : une simple révision de session **ne doit pas les effacer**. Une incompatibilité réelle du tracé peut invalider les records de tours associés à ce tracé.
- Les données sont propres au navigateur et à l'appareil, sans compte ni synchronisation.

Les comportements supplémentaires souhaités (personnage de départ, grille aléatoire, effets d'adhérence des obstacles, collisions entre IA, podium, conservation du classement d'une course) ne sont **pas** des règles déjà livrées : ils sont suivis dans [BACKLOG.md](BACKLOG.md).
