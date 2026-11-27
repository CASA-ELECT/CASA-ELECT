# Restaurer une sauvegarde

À faire seulement en cas de problème grave (données effacées par erreur, base endommagée, nouveau compte Supabase).

1. Choisissez la copie : la plus récente avant le problème (PC : `C:\Sauvegardes\CASA-ELECT`, disque externe : `Sauvegardes-CASA-ELECT`, ou copie en ligne déchiffrée : voir `outils/sauvegarde-en-ligne/LISEZMOI.md`).
2. **Avant tout**, faites une sauvegarde de l'état actuel (**Sauvegarde → Exporter**) : on peut toujours revenir en arrière.
3. Connecté en administrateur : **Sauvegarde → Restaurer** → choisissez le fichier.
   - **Paramètres seulement** : société, logo, numérotation, droits… (les pièces ne bougent pas).
   - **Tout** : remplace toutes les fiches par celles de la copie.
4. Vérifiez : derniers tickets et factures, stock de quelques articles, caisse du jour.
5. Les factures et avoirs émis sont protégés dans la base : si la restauration doit les remplacer, demandez à votre assistant le script de remise à niveau (variable `casa.reset`).

**Test conseillé** : une fois avant le lancement, puis tous les 3 mois, restaurez une copie sur un projet Supabase de test (voir `REINSTALLATION.md`) pour vérifier que les sauvegardes sont bonnes.
