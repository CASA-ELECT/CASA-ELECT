-- =====================================================================
--  CASA-ELECT · Script 2 : compléments pour l'application
--  À coller dans Supabase → SQL Editor → New query → Run (après le script 1).
--  Peut être relancé sans risque.
-- =====================================================================

-- 1. Un compte en attente peut seulement déposer SA demande d'accès
create or replace function public.peut(p_col text, p_id text, p_ecrire boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select
    (split_part(p_col, '/', 1) = 'requests' and p_id = auth.uid()::text and auth.uid() is not null)
    or (public.est_actif() and (
      public.est_admin()
      or coalesce((select case when p_ecrire then r.ecrire else r.lire end = 'tous'
                          or (case when p_ecrire then r.soi_ecrire else r.soi_lire end and p_id = auth.uid()::text)
                   from public.regles r where r.col = split_part(p_col, '/', 1)), true)
    ))
$$;

-- 2. À l'inscription : profil créé + demande d'accès visible par l'administrateur
create or replace function public.nouveau_profil() returns trigger
language plpgsql security definer set search_path = public as $$
declare premier boolean := not exists (select 1 from public.profils);
begin
  insert into public.profils (user_id, email, nom, role, actif)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data->>'nom', ''), split_part(new.email, '@', 1)),
          case when premier then 'admin' else 'comptoir' end, premier)
  on conflict (user_id) do nothing;
  if not premier then
    insert into public.docs (col, id, data)
    values ('requests', new.id::text, jsonb_build_object('at', now(), 'email', new.email,
            'nom', coalesce(nullif(new.raw_user_meta_data->>'nom', ''), split_part(new.email, '@', 1))))
    on conflict (col, id) do nothing;
  end if;
  return new;
end $$;

-- 3. Le rôle choisi dans l'application (Personnel / demandes d'accès) devient le droit réel dans la base
create or replace function public.staff_vers_profil() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if tg_op = 'DELETE' then
    if old.col = 'staff' and old.id ~ '^[0-9a-f-]{36}$' then
      update public.profils set actif = false where user_id = old.id::uuid and role <> 'admin';
    end if;
    return old;
  end if;
  if new.col = 'staff' and new.id ~ '^[0-9a-f-]{36}$' then
    r := new.data->>'role';
    if r in ('admin','commercial','technicien','comptoir','rh') then
      update public.profils set role = r, actif = true where user_id = new.id::uuid and role <> 'admin';  -- un administrateur ne se rétrograde pas par erreur
    end if;
  end if;
  return new;
end $$;
drop trigger if exists docs_staff on public.docs;
create trigger docs_staff after insert or update or delete on public.docs
  for each row execute function public.staff_vers_profil();

-- Seul un administrateur peut écrire dans « staff » (déjà prévu par la règle) ; on interdit en plus
-- de retirer le dernier administrateur actif.
create or replace function public.garder_un_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.actif and (new.role <> 'admin' or not new.actif)
     and (select count(*) from public.profils where role = 'admin' and actif) <= 1 then
    raise exception 'Il doit rester au moins un administrateur actif.';
  end if;
  return new;
end $$;
drop trigger if exists profils_un_admin on public.profils;
create trigger profils_un_admin before update on public.profils
  for each row execute function public.garder_un_admin();

-- 4. Mise à jour partielle d'une fiche (fusion des champs), refusée si la fiche n'existe pas
create or replace function public.doc_maj(p_col text, p_id text, p_patch jsonb) returns boolean
language plpgsql security invoker set search_path = public as $$
begin
  update public.docs set data = data || p_patch where col = p_col and id = p_id;
  return found;
end $$;

-- 5. Verrou court pour les numéros de pièces (évite deux factures avec le même numéro)
create table if not exists public.verrous (cle text primary key, porteur text not null, expire timestamptz not null);
alter table public.verrous enable row level security;
revoke all on public.verrous from anon, authenticated;
create or replace function public.prendre_verrou(p_cle text, p_porteur text, p_ttl_ms integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok text;
begin
  if not public.est_actif() then return false; end if;
  insert into public.verrous as v (cle, porteur, expire)
  values (p_cle, p_porteur, now() + make_interval(secs => p_ttl_ms / 1000.0))
  on conflict (cle) do update set porteur = excluded.porteur, expire = excluded.expire
    where v.expire < now() or v.porteur = excluded.porteur
  returning porteur into ok;
  return ok is not null;
end $$;

-- 6. Noms des collègues (pour le planning, les pointages…), sans exposer les autres informations
create or replace function public.noms(p_ids uuid[]) returns table (user_id uuid, nom text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.nom from public.profils p where public.est_actif() and p.user_id = any (p_ids)
$$;

revoke execute on function public.doc_maj(text, text, jsonb), public.prendre_verrou(text, text, integer), public.noms(uuid[]) from anon;
grant execute on function public.doc_maj(text, text, jsonb), public.prendre_verrou(text, text, integer), public.noms(uuid[]) to authenticated;

select 'script 2 installé' as resultat;
