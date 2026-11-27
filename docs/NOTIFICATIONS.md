# Notifications de l'agenda sur les téléphones

L'application installée sur le téléphone reçoit les rappels (rendez-vous, interventions) et le résumé du jour, même fermée. Chaque utilisateur règle ses heures dans **Mon agenda → Notifications**.

## Mise en place (une seule fois, environ 20 minutes)

1. **Supabase → Edge Functions → Deploy a new function → Via Editor.** Nom : `rappels`. Collez tout le fichier `supabase/functions/rappels/index.ts` de ce dépôt, puis **Deploy**.
2. Dans la fonction `rappels` → **Details** : désactivez **Verify JWT** (enforce JWT verification) et enregistrez. La fonction est protégée par son propre mot de passe (`CRON_SECRET`).
3. **Edge Functions → Secrets** : ajoutez trois secrets (valeurs dans le document privé du projet Claude `claude/supabase/cles-notifications.md`) :
   - `VAPID_PUBLIC`
   - `VAPID_PRIVATE`
   - `CRON_SECRET`
4. **SQL Editor** : collez `sql/05-notifications-casa-elect.sql`, remplacez `<CRON_SECRET>` par la même valeur, **Run**.
5. Sur chaque téléphone : installez l'application (Chrome : menu ⋮ → Installer l'application ; iPhone iOS 16.4 ou plus : Partager → Sur l'écran d'accueil), ouvrez-la depuis son icône, puis **Mon agenda → Notifications → Activer les notifications sur cet appareil**.

## Vérifier
- **Edge Functions → rappels → Logs** : un appel toutes les 5 minutes, réponse `{"envois":…}`.
- Créez un rendez-vous dans 35 minutes avec un rappel « 30 min avant » : la notification arrive dans les 5 minutes qui suivent l'heure du rappel.

Sans cette mise en place, les rappels s'affichent seulement quand l'application est ouverte.
