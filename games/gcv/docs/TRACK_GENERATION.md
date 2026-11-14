# Génération de circuits GCV

## Principe

Le tracé est défini comme une suite de **sections** au lieu d'une liste de
coordonnées écrites à la main. Le module pur `track-generator.js` transforme
cette description et une **graine** numérique en un centre de chaussée,
ses points de départ/arrivée et ses éléments de jeu.

Une section est de l'un de ces deux types :

- `straight` : longueur en mètres ; peut porter une bosse (`hump`) ou une
  zone Arc-en-ciel (`rainbow: true`) ;
- `turn` : angle en degrés (`angle` positif vers la droite du monde,
  négatif vers l'autre côté), rayon en mètres.

Le générateur discrétise les lignes droites (environ 28 m entre points) et
les virages (environ 15 m), puis `world-3d.js` crée la spline Catmull-Rom,
les 720 échantillons de chaussée, les barrières et les bandes colorées à
partir de ce centre commun. La physique et le rendu réutilisent la
**même fonction `heightAt(t)`** pour les bosses.

## Exemple minimal

```js
const template = {
  origin: [0, 90],
  heading: 0, // 0 vers -Z ; distances en mètres
  spawnMetres: 20,
  startMetres: 70,
  finishMargin: 45,
  sections: [
    { type: "straight", length: 430,
      hump: { height: 16, widthMetres: 110,
              crown: 1, crownWidthMetres: 38 } },
    { type: "turn", angle: 55, radius: 90 },
    { type: "straight", length: 170, rainbow: true },
    { type: "turn", angle: -45, radius: 100 },
    { type: "straight", length: 250 },
  ],
};
const route = GcvTrackGenerator.build(template, 12345);
// route.WAYPOINTS, route.START, route.SPAWN, route.FINISH,
// route.HUMP_PROFILES, route.RAINBOW, route.SECTIONS, route.heightAt(t)
```

Pour préparer une famille de circuits variés, chaque section peut indiquer
`lengthVariance`, `angleVariance` ou `radiusVariance` : le générateur
tire une variation bornée à partir de la graine. La même graine et le même
template produisent **exactement le même parcours** (sans `Math.random`).
Changer l'ordre, le nombre ou les paramètres des sections produit des
parcours plus différents encore. Dans l'état actuel, la fonction
`GcvTrackLayout.generateSprint(seed)` expose les variantes de la Route
Arc-en-ciel, mais **le menu utilise encore une seule graine fixe**. Aucun
tirage aléatoire ne modifie une course déjà lancée.

## Règles de conception et vérifications

- Les bosses et les bandes Arc-en-ciel sont **interdites dans les sections
  `turn`**. Une bosse doit disposer d'au moins `1,8 × widthMetres` libres
  de chaque côté du sommet, à l'intérieur de la même ligne droite.
- Les bosses combinent une longue montée/descente et une couronne plus
  courte au sommet. Leur amplitude physique dépend de la courbure et de
  la vitesse du véhicule, non d'une impulsion de saut fixe.
- Le départ, la grille et l'arrivée sont calculés sur les portions droites,
  loin des extrémités. La route est actuellement **ouverte**, orientée
  principalement vers l'avant ; la validation interdit les replis extrêmes
  pour préserver les collisions et la progression chronométrée.
- La zone Arc-en-ciel est désormais **courte (environ 145 m)** et comporte
  les mêmes sept bandes et l'assistance de zigzag existante.
- Le générateur n'alloue ni mesh ni contexte WebGL et ne s'exécute
  **qu'à la construction du circuit**. On conserve le budget de 720
  échantillons et les optimisations de rendu mobile.
- Les tests `tests/gcv-track-generator.test.cjs` vérifient les graines,
  les caractéristiques des sections, les contraintes de placement et
  les erreurs de configuration. Un lot de 500 graines a également été
  vérifié lors de l'introduction du système.

## Où modifier le circuit

- `track-generator.js` : algorithme générique, graine, contrôles de
  validité et calcul des marqueurs/caractéristiques ;
- `track-layout.js` : `SPRINT_TEMPLATE` (contenu de la Route Arc-en-ciel),
  `generateSprint(seed)` et registre des circuits existants ;
- `world-3d.js` : conversion de la définition en scène 3D ;
- `physics.js` : décollage et gravité ;
- `track-progress.js` : progression, contrôle aérien et détection des
  franchissements ;
- `lap-times.js` : empreinte de circuit liée aux records et sauvegardes.

Ajouter plus tard un choix de graine au menu imposera de conserver cette
graine et la version du générateur dans la session et les clés de records,
ainsi que de reconstruire la scène seulement au clic sur « Démarrer ».
Le circuit classique existant reste volontairement indépendant du nouveau
générateur jusqu'à une éventuelle refonte de son tracé.
