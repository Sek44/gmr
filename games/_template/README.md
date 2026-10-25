# Modèle de nouveau jeu

1. Copier ce dossier vers games/<identifiant> (par exemple games/memory).
2. Dans game.js, remplacer game-id par le nouvel identifiant.
3. Dans index.html, personnaliser les titres, le contenu et le lien vers scores.html.
4. Ajouter l'entrée du jeu à games/catalog.js, par exemple :
   { id: "memory", title: "Mémoire", description: "Retrouve les paires.", icon: "★" }
5. Appeler autosave.changed() après chaque modification de l'état du jeu.
6. Appeler autosave.stop({ discard: true }) quand la partie est définitivement terminée.
   Appeler GameScores.save({ gameId, score, total }) une seule fois si le résultat doit être enregistré.

Le répertoire _template n'est pas inscrit au catalogue. Il ne s'agit pas d'un jeu publié.
Les chemins relatifs ../../ fonctionnent sur GitHub Pages, même sous /gmr/.
