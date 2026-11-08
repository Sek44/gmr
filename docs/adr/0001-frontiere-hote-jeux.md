# ADR-0001 — Séparer le conteneur GMR des implémentations de jeux

- **Date :** 2026-11-08
- **Statut :** Accepté
- **Portée :** architecture transversale de GMR

## Contexte

GMR doit héberger des jeux très différents, tout en conservant un site léger, sans serveur ni build obligatoire. Les jeux partagent certaines contraintes (navigation, reprise, scores, quota de temps, affichage responsive), mais pas leurs moteurs, leurs règles ni leurs commandes. La présentation des records de tours GCV était auparavant directement codée dans le service commun de scores.

## Options envisagées

1. Un moteur unique et des composants de gameplay communs pour tous les jeux : trop contraignant pour des jeux hétérogènes.
2. Des pages de jeux entièrement indépendantes : conduit à dupliquer navigation, persistance, budget et présentation du site.
3. Un **hôte commun léger**, avec des jeux autonomes et des adaptateurs explicites aux services partagés : option retenue.

## Décision

- `shared/` gère exclusivement les services de site : présentation du cadre commun, catalogue, navigation et scores, état de session, confirmations, crédit de temps de jeu. `shared/site.css` conserve une URL stable et importe `shared/styles/{base,components,home,scores,play-time}.css`.
- Chaque jeu possède son propre HTML, son code, son CSS métier et ses ressources sous `games/<id>/`. Le jeu peut utiliser les APIs publiques de `shared/`, mais ne dépend pas d'un autre jeu.
- Les services partagés ne connaissent aucun module interne de jeu. Un format de scores particulier ajoute un adaptateur dans son propre dossier, enregistré auprès de `GameScores.registerRenderer(id, render)` avant l'affichage de la page.
- Les contrats de stockage existants sont conservés. Aucun changement de révision de sauvegarde GCV n'est nécessaire pour un déplacement de code de présentation.
- Une vérification automatisée contrôle les chemins de catalogue et les frontières communes. Le navigateur réel reste nécessaire pour les interactions WebGL et tactiles.

## Conséquences

Les jeux restent libres de choisir leurs moteurs et leurs architectures internes. L'ajout d'un jeu demande l'enregistrement au catalogue, sa page autonome et ses documents ; les services existants sont réutilisables sans réécrire le site. Un nouveau format de score peut nécessiter un adaptateur et son chargement dans la page Scores, sans modification du service de base.

La réorganisation de CSS est additive sous le point d'entrée existant ; elle n'est pas une refonte visuelle. Les feuilles partagées restent chargées sur les pages de jeux afin de conserver les styles de conteneur et les compatibilités historiques.
