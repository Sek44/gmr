# GMR — instructions de développement

- Site statique destiné aux enfants, publié par GitHub Pages, sans framework ni étape de compilation.
- Monorepo : un dossier par jeu dans games/<id>/ ; composants communs dans shared/.
- Les jeux enregistrés dans games/catalog.js sont les seuls affichés sur l'accueil.
- Utiliser des URLs relatives (compatibilité avec https://sek44.github.io/gmr/).
- Conserver une présentation responsive tactile (téléphone, tablette portrait/paysage, ordinateur).
- Réutiliser GameState, GameScores, AppConfirm, ScoreView et GameUI au lieu de dupliquer leur logique.
- Sauvegarder la partie courante après chaque mutation importante, lors de pagehide et quand la page devient cachée.
- Restaurer une partie après rechargement et retour depuis l'accueil. Une visite des scores ne doit pas perdre les saisies, minuteurs ni états de jeu.
- Une partie terminée ne doit pas être restaurée ni ajouter deux fois son score.
- Ne jamais effacer l'historique complet des scores. Suppression d'un seul score uniquement avec confirmation dans l'application.
- Les clés localStorage de GMR commencent par gmr:v1:. Ne pas toucher aux clés de xfr1/exercices.
- Ne pas casser les anciennes sauvegardes, ni exiger de nouveaux champs dans les historiques existants. S'il manque une heure, afficher 00:00.
- Les échecs d'accès à localStorage doivent être gérés sans faire planter le jeu.
- Vérifier les tests avant publication. Les jeux ne doivent pas importer du code spécifique à un autre jeu.
