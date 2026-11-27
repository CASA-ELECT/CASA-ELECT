# Kit d'autonomie CASA-ELECT

À garder **sur le disque externe** (copie de ce dépôt) et sur GitHub. Avec ce kit, l'application peut être réinstallée sans aide.

| Élément | Où |
| --- | --- |
| Code source complet de l'application | ce dépôt : `index.html`, `sbshim.js`, `lib/` |
| Scripts de la base (dans l'ordre) | `sql/01…`, `sql/02…`, `sql/03…`, `sql/04…` |
| Guide de réinstallation pas à pas | `docs/REINSTALLATION.md` |
| Guide de restauration d'une sauvegarde | `docs/RESTAURATION.md` |
| Sauvegarde en ligne chaque nuit | `outils/sauvegarde-en-ligne/` |
| Sauvegarde PC + disque externe | `outils/sauvegarde-pc/` |
| Documentation technique, manuel, guides par profil | projet Claude « application web » |

## Vos accès : à protéger absolument
Perdre un de ces accès, c'est perdre le contrôle de l'application.

1. **E-mail du gérant** (celui des comptes GitHub et Supabase) : activez la double authentification.
2. **GitHub** : Settings → Password and authentication → **Two-factor authentication** → application d'authentification sur votre téléphone. Téléchargez les **codes de secours** (recovery codes).
3. **Supabase** : Account → Security → **Multi-factor authentication**.
4. **Imprimez** les codes de secours GitHub, le mot de passe de la base Supabase et le mot de passe des sauvegardes chiffrées (`BACKUP_PASSPHRASE`). Rangez le papier dans un endroit sûr, hors du magasin (et une copie chez une personne de confiance).

Une fois par an : vérifiez que vous pouvez encore vous connecter partout avec ces codes.

## Copier le kit sur le disque externe
GitHub → dépôt CASA-ELECT → **Code → Download ZIP**, puis copiez le ZIP sur le disque `CASA-SAUV` (à refaire après chaque mise à jour importante).
