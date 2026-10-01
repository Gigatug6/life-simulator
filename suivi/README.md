# Dossier de suivi — un fichier par chat

Chaque conversation (chat) avec l'agent a **son propre fichier de suivi** ici. On garde ainsi l'historique de tout ce qui a été fait, chat après chat, sans réécrire le passé.

## Règles

1. **Un nouveau chat = un nouveau fichier** `NN-sujet-court.md` (NN = numéro suivant, sur 2 chiffres). Copier `_modele.md`.
2. Pendant le chat, l'agent ne met à jour **que le fichier de ce chat** (case cochée, journal, prochaine étape, limites).
3. Les fichiers des chats précédents sont de l'**historique** : on ne les modifie pas (sauf pour y ajouter un lien « Suite : … »).
4. Le fichier du chat se termine par le statut (en cours / terminé) et une section « Limites connues ».
5. Ajouter une ligne à l'index ci-dessous quand un fichier est créé.

## Index

| N° | Fichier | Sujet | Statut |
|---|---|---|---|
| 01 | [`01-simulateur-initial.md`](01-simulateur-initial.md) | Construction du simulateur : Docker, WASM, rendu 2D, persistance, mode Dieu, intelligence, GitHub Pages | terminé |
| 02 | [`02-mode-3d-evolution.md`](02-mode-3d-evolution.md) | Mode 3D, évolution physique des créatures, nouveaux neurones, effets visuels | en cours |
