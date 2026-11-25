# CASA-ELECT — application de gestion

Application web de gestion de CASA-ELECT (travaux d'électricité et vente de matériel électrique) :
ventes comptoir, devis, factures, stock, achats, caisse, planning, personnel.

- **Programme** : ce dépôt (publié gratuitement avec GitHub Pages). Il ne contient **aucune donnée** de la société.
- **Données** : base Supabase de la société, protégée par des comptes et des règles d'accès par rôle.

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | L'application |
| `sbshim.js` | Connexion à Supabase (comptes, lecture/écriture des données, temps réel) |
| `lib/` | Bibliothèque Supabase (copie locale) |
| `codes-postaux.json` | Gouvernorats, délégations, localités et codes postaux de Tunisie (données publiques) |
| `sql/01-base-casa-elect.sql` | Script 1 : tables, comptes, règles d'accès |
| `sql/02-complements-casa-elect.sql` | Script 2 : rôles du personnel, verrou de numérotation, demandes d'accès |

## Mise en place (une seule fois)

1. Supabase → SQL Editor : exécuter `sql/01-base-casa-elect.sql` puis `sql/02-complements-casa-elect.sql`.
2. Le **premier compte créé** devient administrateur. Les comptes suivants attendent la validation de l'administrateur (menu Personnel → demandes d'accès).
3. GitHub → Settings → Pages : *Deploy from a branch*, branche `main`, dossier `/ (root)`.
4. Supabase → Authentication → URL Configuration : *Site URL* = adresse GitHub Pages de l'application.

## Sauvegarde

Menu **Administration → Sauvegarde** : télécharger chaque semaine le fichier `.json` et le garder sur le PC ou une clé USB.
