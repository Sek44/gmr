# Thème d’accueil — Classic Play

**État actuel.** L’accueil GMR adopte un thème clair, classique et ludique : fond discret, bleu franc, accent jaune, cartes blanches, coins arrondis et illustrations vectorielles.

## Sources de vérité

- `shared/styles/home.css` : disposition responsive de l’accueil, indépendante de toute palette ; conserver ici les grilles et espacements. Les cartes ont une largeur limitée à 540 px avec un SVG à gauche et le contenu à droite, y compris sur mobile et lorsqu’un seul jeu est disponible.
- `shared/themes/classic-play/theme.css` : palette et fond du thème, limités aux pages portant `home-body` / `home-page`.
- `shared/themes/classic-play/home.css` : apparence des composants de l’accueil (temps de jeu et cartes, sans bandeau d’introduction).
- `shared/styles/components.css` : boutons, cadres et navigation communs, indépendants du thème de l’accueil.
- `shared/site.css` : ordre d’importation des couches ; ne pas définir de sélecteurs métier ici.
- `shared/home.js` : création des cartes depuis le catalogue (catégorie, titre, action, sans description) ; ne contient aucune logique spécifique à GCV.

## Assets

- **SVG uniquement** pour les nouvelles ressources de l’interface (pas de PNG, WebP, JPEG, GIF ni police téléchargée).
- `shared/themes/classic-play/assets/` : pictogrammes génériques : manette, trophée, horloge et flèche.
- `games/<id>/assets/` : illustrations SVG propres à chaque jeu ; l’entrée `artwork` de `games/catalog.js` contient le chemin relatif à l’accueil. Super Kart est représenté par un circuit et un drapeau à damier dans `games/gcv/assets/home-circuit.svg`.
- Les SVG sont des fichiers autonomes avec `viewBox`, sans dépendances externes ni image raster embarquée. Les pictogrammes redondants avec le texte ont `alt=""`.
- Un jeu sans `artwork` utilise `gamepad.svg` comme illustration de repli.

## Typographie et couleurs

- Police système sans téléchargement ; titres en graisse forte, contrôles avec libellés courts et toujours visibles.
- Variables `--home-ink`, `--home-muted`, `--home-blue`, `--home-blue-dark`, `--home-line`, `--home-surface` dans `theme.css`.
- Les styles du thème sont volontairement cantonnés à la page d’accueil pour ne pas altérer le rendu de GCV et des futurs jeux.

## Points à vérifier pour chaque évolution

- Portrait étroit (320–360 px), tablette, paysage et ordinateur : aucune colonne tronquée ; les illustrations restent secondaires.
- Navigation clavier, focus visible, textes lisibles, cibles tactiles de taille suffisante, mode `prefers-reduced-motion`.
- Temps de jeu lu depuis `GmrPlayTime` et scores conservés : ne jamais recopier le calcul ou modifier les clés de stockage pour changer le style.
- Réutiliser les documents de structure de `docs/` et les tests de contrat avant d’ajouter un nouveau thème.
