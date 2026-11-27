# Sauvegarde en ligne chaque nuit (copie 1 sur 3)

Chaque nuit vers 2 h, GitHub copie toute la base Supabase, la **chiffre** avec votre mot de passe et la range dans un dépôt **privé**. 60 copies sont gardées.

## Mise en place (une seule fois, 15 minutes)

1. Sur GitHub, organisation CASA-ELECT : **New repository** → nom `casa-elect-sauvegardes` → **Private** → Create.
2. Dans ce dépôt, ajoutez les deux fichiers de ce dossier :
   - `sauvegarde.mjs` à la racine ;
   - `sauvegarde.yml` dans le dossier `.github/workflows/` (nom complet : `.github/workflows/sauvegarde.yml`).
3. Dépôt privé → **Settings → Secrets and variables → Actions → New repository secret**, trois secrets :
   - `SUPABASE_URL` : `https://yefptplgdjaqttbdplbl.supabase.co`
   - `SUPABASE_SECRET_KEY` : dans Supabase → **Project Settings → API Keys → Secret keys** → créez une clé et copiez-la (`sb_secret_…`). **Ne la mettez jamais ailleurs que dans ces secrets ou dans le config.json du PC.**
   - `BACKUP_PASSPHRASE` : un mot de passe long que vous inventez. **Écrivez-le sur papier** et rangez-le avec les codes de secours : sans lui, les copies sont illisibles.
4. Onglet **Actions** → « Sauvegarde nocturne » → **Run workflow** pour un premier essai. Un fichier `copies/casa-AAAA-MM-JJ.json.gz.enc` doit apparaître.

## Relire une copie

Sur un PC avec Git pour Windows (Git Bash) ou Linux :

```
openssl enc -d -aes-256-cbc -pbkdf2 -in casa-2027-01-15.json.gz.enc -out casa.json.gz -pass pass:VOTRE_MOT_DE_PASSE
gunzip casa.json.gz
```

Le fichier `casa.json` obtenu se restaure dans l'application : **Sauvegarde → Restaurer** (voir `docs/RESTAURATION.md`).
