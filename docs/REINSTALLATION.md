# Réinstaller l'application sur un nouveau compte Supabase (pas à pas)

Durée : environ 45 minutes. Il faut : ce dépôt GitHub (ou sa copie sur le disque externe), une sauvegarde récente, un e-mail.

## 1. Nouvelle base Supabase
1. https://supabase.com → **New project** (région Europe, mot de passe de base noté sur papier).
2. **SQL Editor → New query** : collez puis **Run**, dans l'ordre, les scripts du dossier `sql/` : `01`, `02`, `03`, `04`. Chacun doit afficher « script N installé ».
3. **Authentication → Sign In / Providers → Email** : désactivez **Confirm email**.
4. **Authentication → URL Configuration** : Site URL = `https://casa-elect.github.io/CASA-ELECT/` (ou la nouvelle adresse), et la même adresse dans Redirect URLs.
5. **Project Settings → API Keys** : notez l'URL du projet et la clé **publishable** (`sb_publishable_…`).

## 2. Le site
1. Dans `sbshim.js`, ligne `const CFG = …`, remplacez l'URL et la clé publishable par les nouvelles. Enregistrez (commit) sur GitHub.
2. GitHub → dépôt → **Settings → Pages** : Source = branche `main`, dossier `/` (racine).
3. Ouvrez l'adresse du site : **Créer mon compte** avec l'e-mail du gérant. **Le premier compte créé devient administrateur.**

## 3. Les données
1. **Sauvegarde → Restaurer → Tout** avec la dernière copie (voir `RESTAURATION.md`).
2. **Personnel** : recréez les accès des employés (bouton « Créer l'accès »), puis **Rôles & droits → Enregistrer**.
3. Remettez en place les sauvegardes automatiques (`outils/`) avec la nouvelle clé secrète.
