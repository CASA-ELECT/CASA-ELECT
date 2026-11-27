-- =====================================================================
--  CASA-ELECT · Script 5 : notifications de l'agenda sur les téléphones
--  À lancer APRÈS avoir créé l'Edge Function « rappels » (voir docs/NOTIFICATIONS.md).
--  Remplacez les deux valeurs entre < > avant de cliquer Run. Peut être relancé sans risque.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Abonnements des téléphones : chaque employé enregistre le sien (une adresse d'abonnement ne permet pas d'envoyer sans la clé privée)
insert into public.regles (col, lire, ecrire, soi_lire, soi_ecrire) values ('pushsubs', 'tous', 'tous', false, false), ('pushlog', 'admin', 'admin', false, false)
on conflict (col) do update set lire = excluded.lire, ecrire = excluded.ecrire;

-- Appel de la fonction d'envoi toutes les 5 minutes
select cron.unschedule('casa-rappels') where exists (select 1 from cron.job where jobname = 'casa-rappels');
select cron.schedule('casa-rappels', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://yefptplgdjaqttbdplbl.supabase.co/functions/v1/rappels',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-casa-cle', '<CRON_SECRET>'),
    body := '{}'::jsonb, timeout_milliseconds := 20000);
$$);

select 'script 5 installé : rappels toutes les 5 minutes' as resultat;
