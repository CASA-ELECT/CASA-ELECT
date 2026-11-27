# Sauvegarde sur le PC du magasin et sur le disque externe (copies 2 et 3 sur 3)

- **Chaque jour à 20 h** (ou 10 minutes après l'ouverture de session si le PC était éteint) : copie complète dans `C:\Sauvegardes\CASA-ELECT`, 30 jours gardés.
- **Chaque semaine** : dès que le disque externe nommé **CASA-SAUV** est branché, la dernière copie y est recopiée (12 semaines gardées).
- Tout est noté dans `C:\Sauvegardes\CASA-ELECT\journal.txt`.

## Mise en place (une seule fois)

1. Copiez ce dossier sur le PC, par exemple dans `C:\CASA-ELECT\sauvegarde-pc`.
2. Copiez `config.exemple.json` en `config.json` et remplacez `sb_secret_A_COLLER_ICI` par la clé secrète Supabase (la même que pour la sauvegarde en ligne).
   Ce fichier donne accès à toute la base : laissez-le seulement sur le PC du gérant, protégé par un mot de passe Windows.
3. Disque externe : clic droit dans l'Explorateur → **Renommer** → `CASA-SAUV`.
4. Double-cliquez sur `installer-tache.cmd`. Il programme la tâche et fait un premier essai ; la dernière ligne du journal doit commencer par « OK ».

Le fichier de sauvegarde est au même format que **Sauvegarde → Exporter** de l'application : il se restaure de la même façon.
