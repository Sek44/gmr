# GCV — Historique de développement

Journal chronologique archivé des étapes du prototype. Les informations des anciennes
versions (nombre de tours, vitesses, sauvegardes, état des fonctionnalités) ne décrivent
**pas** nécessairement le jeu actuel. Consulter [SPECIFICATIONS.md](SPECIFICATIONS.md)
pour les règles en vigueur.

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

**Pas encore réalisés :** les 9 concurrents et leur IA, la grille aléatoire, le décompte, les 3 tours, le classement, les flaques et les graviers, le résultat final et l'enregistrement des scores. Les graphismes et la conduite sont volontairement simples à ce stade.

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


## 34. Fin de course validée uniquement sur la ligne d'arrivée (27/10/2026)

- [x] **Correction d'une arrivée prématurée** : en mode Course, la distance approximative servant au classement ne peut plus terminer les deux tours à elle seule. La fin impose un vrai franchissement de la ligne visible, dans le sens de la course.
- [x] **Grille avant la ligne** : le premier passage démarre le tour n° 1, le deuxième termine le premier tour et le troisième achève la course.
- [x] **Distance anti-oscillation** : ne compter que la progression maximale atteinte le long du tracé. Reculer puis repasser sur le même secteur ou glisser contre une barrière ne rapporte aucune distance supplémentaire.
- [x] **Anti-demi-tour** : valider un nouveau tour uniquement après environ 90 % d'un tour parcouru depuis la ligne précédente ; les allers-retours devant la ligne ne doivent plus avancer artificiellement le chrono ou la progression.
- [x] **Temps d'arrivée** : continuer à interpoler le moment exact du franchissement dans la frame ; ne figer le classement et l'écran de résultats qu'après la deuxième arrivée valide.
- [x] **Sauvegardes** : conserver les courses et records existants ; initialiser prudemment les nouveaux marqueurs pour les anciennes sauvegardes.
- [x] **Vérifications** : tests de franchissement réel, absence de résultat si le compteur dépasse deux tours avant la ligne, demi-tours, chronométrage interpolé et sauvegarde/restauration.

**À contrôler en jeu sur navigateur** : franchissement final à grande vitesse, allers-retours devant la ligne, et fin de course après reprise d'une sauvegarde ancienne.


## 35. Correction du classement en direct et des dépassements (27/10/2026)

- [x] **Distance physique pour le classement** : chaque image accumule le déplacement réel de la voiture projeté sur la tangente du circuit, en mètres. La distance n'est plus dérivée du maximum des indices des échantillons de piste : aucun saut d'index dans un virage serré ne peut créer artificiellement une avance.
- [x] **Marche arrière et déplacements latéraux** : un recul retranche sa distance et un mouvement purement latéral ne fait gagner aucune place. Les contacts avec les barrières n'ajoutent pas de progression factice.
- [x] **Dépassements des adversaires** : comparer en continu la distance physique du joueur aux distances parcourues par les neuf IA ; quand une IA le dépasse, le classement doit changer pendant la course.
- [x] **Tours validés indépendamment** : conserver l'obligation des franchissements physiques de la ligne d'arrivée avec garde anti-demi-tour avant de terminer chaque tour et la course.
- [x] **Sauvegardes anciennes** : recalculer une seule fois la progression des courses sauvegardées par l'ancienne méthode, à partir de la position réelle sur le tracé et des tours déjà validés.
- [x] **Tests** : déplacement longitudinal signé, déplacements latéraux, retour arrière, dépassement d'un leader arrêté, absence d'avance fictive après saut d'index, migration d'une sauvegarde corrompue et conservation des deux tours.

**À confirmer en jeu sur téléphone/tablette** : une IA doublant le joueur fait évoluer immédiatement le rang affiché, y compris dans les virages ; les courses sauvegardées anciennement ne démarrent plus avec un classement artificiellement élevé.

## 36. Passage à trois tours et rythme des concurrents (27/10/2026)

- Courses de **3 tours** et records chronométrés réinitialisés dans un espace dédié.
- Temps cibles des neuf IA diminués de deux secondes, avec légère hausse de difficulté.
- Les anciennes sessions de jeu sont désormais annulées après changement incompatible ;
  les historiques de records ne sont pas supprimés.

## Refactoring n° 2 — progression unique des tours (27/10/2026)

- `GcvTrackProgress` devient l'unique source de vérité pour la distance du
  joueur, les franchissements physiques dans le bon sens et les tours validés.
- `GcvRace` en déduit son classement, la fin après 3 tours et les temps de
  passage ; `GcvLapTimes` conserve seulement le chrono et les secteurs en
  consommant les mêmes événements validés. Le HUD lit les tours confirmés.
- Les anciens comptages par bouclage des indices, synchronisations manuelles
  et franchissements déclenchés par les secteurs sont retirés.
- Les protections contre demi-tours, raccourcis, changements d'épingle et
  chutes restent actives ; les adversaires avancent pendant la récupération.
- Nouvelles vérifications transversales progression/course/chrono. Révision des
  sauvegardes GCV à 4 : courses et essais en cours annulables, records préservés.
