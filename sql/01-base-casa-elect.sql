-- =====================================================================
--  CASA-ELECT · Script 1 : base de données, comptes et règles d'accès
--  À coller dans Supabase → SQL Editor → New query → Run.
--  Le script peut être relancé sans risque (il ne supprime aucune donnée).
-- =====================================================================

-- 1. Profils des utilisateurs (rôle dans la société)
create table if not exists public.profils (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  nom        text,
  role       text not null default 'comptoir'
             check (role in ('admin','commercial','technicien','comptoir','rh')),
  actif      boolean not null default false,       -- un nouveau compte attend la validation de l'administrateur
  cree_le    timestamptz not null default now()
);
alter table public.profils enable row level security;

-- Le tout premier compte créé devient administrateur et actif ;
-- les suivants sont créés « en attente » (inactifs) jusqu'à validation.
create or replace function public.nouveau_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (user_id, email, nom, role, actif)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nom', split_part(new.email, '@', 1)),
          case when exists (select 1 from public.profils) then 'comptoir' else 'admin' end,
          not exists (select 1 from public.profils))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists apres_inscription on auth.users;
create trigger apres_inscription after insert on auth.users
  for each row execute function public.nouveau_profil();

-- Fonctions utilisées par les règles (security definer : évite les boucles RLS)
create or replace function public.mon_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profils where user_id = auth.uid() and actif
$$;
create or replace function public.est_actif() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select actif from public.profils where user_id = auth.uid()), false)
$$;
create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mon_role() = 'admin', false)
$$;

drop policy if exists "profil : lire le sien ou admin" on public.profils;
create policy "profil : lire le sien ou admin" on public.profils
  for select to authenticated using (user_id = auth.uid() or public.est_admin());
drop policy if exists "profil : admin modifie" on public.profils;
create policy "profil : admin modifie" on public.profils
  for update to authenticated using (public.est_admin()) with check (public.est_admin());
drop policy if exists "profil : admin supprime" on public.profils;
create policy "profil : admin supprime" on public.profils
  for delete to authenticated using (public.est_admin() and user_id <> auth.uid());

-- 2. Règles d'accès par collection (même logique que la version d'essai)
--    lire / ecrire : 'tous' = tout employé actif, 'admin' = administrateur seulement
--    soi_lire / soi_ecrire : l'employé peut lire / écrire SON propre document (id = son identifiant)
create table if not exists public.regles (
  col        text primary key,
  lire       text not null check (lire in ('tous','admin')),
  ecrire     text not null check (ecrire in ('tous','admin')),
  soi_lire   boolean not null default false,
  soi_ecrire boolean not null default false
);
alter table public.regles enable row level security;
drop policy if exists "regles : lecture" on public.regles;
create policy "regles : lecture" on public.regles for select to authenticated using (public.est_actif());

insert into public.regles (col, lire, ecrire, soi_lire, soi_ecrire) values
  ('settings',     'tous',  'admin', false, false),
  ('staff',        'tous',  'admin', false, false),
  ('personnel',    'tous',  'admin', false, false),
  ('requests',     'admin', 'admin', true,  true),
  ('rh',           'admin', 'admin', true,  false),
  ('pointages',    'admin', 'admin', true,  true),
  ('demandes',     'admin', 'admin', true,  true),
  ('rhformations', 'admin', 'admin', false, false),
  ('rhrecrut',     'admin', 'admin', false, false),
  ('depenses',     'admin', 'admin', false, false),
  ('facfourn',     'admin', 'admin', false, false),
  ('reglfourn',    'admin', 'admin', false, false),
  ('caisse',       'admin', 'admin', false, false),
  ('avoirsfourn',  'admin', 'admin', false, false),
  ('clotures',     'admin', 'admin', false, false),
  ('contactsadm',  'admin', 'admin', false, false),
  ('historique',   'admin', 'admin', false, false),
  ('retoursfourn', 'admin', 'admin', false, false)
on conflict (col) do update set lire = excluded.lire, ecrire = excluded.ecrire,
  soi_lire = excluded.soi_lire, soi_ecrire = excluded.soi_ecrire;
-- Toute collection absente de cette liste : lecture et écriture pour tout employé actif.

create or replace function public.peut(p_col text, p_id text, p_ecrire boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_actif() and (
    public.est_admin()
    or coalesce((select case when p_ecrire then r.ecrire else r.lire end = 'tous'
                        or (case when p_ecrire then r.soi_ecrire else r.soi_lire end and p_id = auth.uid()::text)
                 from public.regles r where r.col = split_part(p_col, '/', 1)), true)
  )
$$;

-- 3. Les données de l'application : une ligne par fiche (client, article, facture…)
create table if not exists public.docs (
  col        text not null,              -- collection : 'clients', 'factures', …
  id         text not null,              -- identifiant de la fiche
  data       jsonb not null default '{}'::jsonb,
  modifie_le timestamptz not null default now(),
  modifie_par uuid default auth.uid(),
  primary key (col, id)
);
create index if not exists docs_col_idx on public.docs (col);
alter table public.docs enable row level security;
alter table public.docs replica identity full;   -- nécessaire au temps réel avec RLS

drop policy if exists "docs : lire"     on public.docs;
drop policy if exists "docs : ajouter"  on public.docs;
drop policy if exists "docs : modifier" on public.docs;
drop policy if exists "docs : effacer"  on public.docs;
create policy "docs : lire"     on public.docs for select to authenticated using (public.peut(col, id, false));
create policy "docs : ajouter"  on public.docs for insert to authenticated with check (public.peut(col, id, true));
create policy "docs : modifier" on public.docs for update to authenticated using (public.peut(col, id, true)) with check (public.peut(col, id, true));
create policy "docs : effacer"  on public.docs for delete to authenticated using (public.peut(col, id, true));

create or replace function public.horodater() returns trigger language plpgsql as $$
begin new.modifie_le := now(); new.modifie_par := auth.uid(); return new; end $$;
drop trigger if exists docs_horodatage on public.docs;
create trigger docs_horodatage before insert or update on public.docs
  for each row execute function public.horodater();

-- 4. Journal des suppressions (filet de sécurité : rien ne disparaît sans trace)
create table if not exists public.corbeille (
  col text, id text, data jsonb, supprime_le timestamptz default now(), supprime_par uuid default auth.uid()
);
alter table public.corbeille enable row level security;
drop policy if exists "corbeille : admin" on public.corbeille;
create policy "corbeille : admin" on public.corbeille for select to authenticated using (public.est_admin());
create or replace function public.vers_corbeille() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into public.corbeille (col, id, data) values (old.col, old.id, old.data); return old; end $$;
drop trigger if exists docs_corbeille on public.docs;
create trigger docs_corbeille after delete on public.docs
  for each row execute function public.vers_corbeille();

-- 5. Droits d'accès techniques (uniquement les utilisateurs connectés, jamais les anonymes)
revoke all on public.docs, public.profils, public.regles, public.corbeille from anon;
grant select, insert, update, delete on public.docs to authenticated;
grant select, update, delete on public.profils to authenticated;
grant select on public.regles, public.corbeille to authenticated;

-- 6. Temps réel : les écrans se mettent à jour tout seuls quand un collègue enregistre
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- Vérification : doit afficher 18 règles
select count(*) as regles_installees from public.regles;
