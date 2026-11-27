-- =====================================================================
--  CASA-ELECT · Script 3 : rôles & droits réels, plusieurs profils,
--  factures verrouillées, stock calculé dans la base, prix d'achat à part
--  À coller dans Supabase → SQL Editor → New query → Run (après les scripts 1 et 2).
--  Peut être relancé sans risque.
-- =====================================================================

-- 1. Plusieurs profils par employé (cumul permanent + remplacement provisoire)
alter table public.profils add column if not exists roles text[] not null default '{}';
alter table public.profils add column if not exists temp  jsonb  not null default '[]'::jsonb;

create or replace function public.mes_roles() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce((
    select array(select distinct x from unnest(
      array[p.role] || coalesce(p.roles, '{}') ||
      coalesce(array(select t->>'role' from jsonb_array_elements(p.temp) t
                     where (t->>'du') <= to_char(now() at time zone 'Africa/Tunis', 'YYYY-MM-DD')
                       and (t->>'au') >= to_char(now() at time zone 'Africa/Tunis', 'YYYY-MM-DD')), '{}')
    ) x where x is not null)
    from public.profils p where p.user_id = auth.uid() and p.actif), '{}')
$$;

-- Le profil choisi dans l'application (Personnel) devient le droit réel, profils supplémentaires compris
create or replace function public.staff_vers_profil() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text; extra text[]; tmp jsonb;
begin
  if tg_op = 'DELETE' then
    if old.col = 'staff' and old.id ~ '^[0-9a-f-]{36}$' then
      update public.profils set actif = false where user_id = old.id::uuid and role <> 'admin';
    end if;
    return old;
  end if;
  if new.col = 'staff' and new.id ~ '^[0-9a-f-]{36}$' then
    r := new.data->>'role';
    extra := coalesce(array(select jsonb_array_elements_text(coalesce(new.data->'roles', '[]'::jsonb))), '{}');
    tmp := coalesce(new.data->'temp', '[]'::jsonb);
    if r in ('admin','commercial','technicien','comptoir','rh') then
      update public.profils set role = r, roles = extra, temp = tmp, actif = true where user_id = new.id::uuid and role <> 'admin';
    end if;
  end if;
  return new;
end $$;

-- 2. Droits par profil et par collection, réglés dans l'écran « Rôles & droits »
--    niveau : 0 aucun · 1 voir · 2 créer/modifier · 3 tout (supprimer compris)
create table if not exists public.droits (role text not null, col text not null, niveau int not null default 0, primary key (role, col));
alter table public.droits enable row level security;
drop policy if exists "droits : lecture" on public.droits;
create policy "droits : lecture" on public.droits for select to authenticated using (public.est_actif());
grant select on public.droits to authenticated;

create or replace function public.droits_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text; c text; v jsonb;
begin
  if new.col = 'settings' and new.id = 'droitsdb' then
    delete from public.droits;
    for r, v in select key, value from jsonb_each(coalesce(new.data->'roles', '{}'::jsonb)) loop
      insert into public.droits (role, col, niveau)
        select r, key, least(3, greatest(0, (value)::text::int)) from jsonb_each(v)
      on conflict (role, col) do update set niveau = excluded.niveau;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists docs_droits on public.docs;
create trigger docs_droits after insert or update on public.docs for each row execute function public.droits_sync();

-- Prix d'achat et coûts : collection à part, réservée à l'administrateur sauf droit donné
insert into public.regles (col, lire, ecrire, soi_lire, soi_ecrire) values ('couts', 'admin', 'admin', false, false)
on conflict (col) do nothing;

create or replace function public.niveau(p_col text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(d.niveau), 0) from public.droits d where d.col = p_col and d.role = any (public.mes_roles())
$$;

create or replace function public.peut(p_col text, p_id text, p_ecrire boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare c text := split_part(p_col, '/', 1); r public.regles%rowtype;
begin
  if c = 'requests' and p_id = auth.uid()::text and auth.uid() is not null then return true; end if;
  if not public.est_actif() then return false; end if;
  if public.est_admin() then return true; end if;
  select * into r from public.regles where col = c;
  if found and p_id = auth.uid()::text and (case when p_ecrire then r.soi_ecrire else r.soi_lire end) then return true; end if;
  if exists (select 1 from public.droits where col = c) then
    return public.niveau(c) >= (case when p_ecrire then 2 else 1 end);
  end if;
  if found then return (case when p_ecrire then r.ecrire else r.lire end) = 'tous'; end if;
  return true;  -- collections techniques (compteurs, verrous, journal, mouvements…)
end $$;

create or replace function public.peut_effacer(p_col text, p_id text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare c text := split_part(p_col, '/', 1);
begin
  if not public.est_actif() then return false; end if;
  if public.est_admin() then return true; end if;
  if exists (select 1 from public.droits where col = c) then return public.niveau(c) >= 3; end if;
  return public.peut(p_col, p_id, true);
end $$;

drop policy if exists "docs : effacer" on public.docs;
create policy "docs : effacer" on public.docs for delete to authenticated using (public.peut_effacer(col, id));

-- 3. Une facture ou un avoir émis ne se modifie plus et ne se supprime pas : correction par avoir
create or replace function public.verrou_factures() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('casa.reset', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if; return new;
  end if;
  if tg_op = 'DELETE' then
    if old.col in ('factures', 'avoirs') then raise exception 'Une facture ou un avoir émis ne peut pas être supprimé : faites un avoir.'; end if;
    return old;
  end if;
  if new.col in ('factures', 'avoirs') and coalesce(old.data->>'statut', '') <> 'Brouillon' then
    if (new.data->'lignes') is distinct from (old.data->'lignes') or (new.data->'totals') is distinct from (old.data->'totals')
       or (new.data->>'numero') is distinct from (old.data->>'numero') or (new.data->>'type') is distinct from (old.data->>'type')
       or (new.data->>'date') is distinct from (old.data->>'date') or (new.data->'client') is distinct from (old.data->'client') then
      raise exception 'Facture émise : elle ne peut plus être modifiée. Corrigez-la par un avoir.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists docs_verrou_factures on public.docs;
create trigger docs_verrou_factures before update or delete on public.docs for each row execute function public.verrou_factures();

-- 4. Stock calculé dans la base, en une seule opération (deux ventes simultanées ne se perdent plus)
create or replace function public.stock_maj(p_aid text, p_delta numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare av numeric; ap numeric; nm text; rf text;
begin
  if not public.est_actif() then raise exception 'Compte inactif'; end if;
  update public.docs set data = jsonb_set(data, '{stock}', to_jsonb(round(coalesce(nullif(data->>'stock', '')::numeric, 0) + p_delta, 3)))
   where col = 'articles' and id = p_aid
   returning round(coalesce(nullif(data->>'stock', '')::numeric, 0) - p_delta, 3), (data->>'stock')::numeric, data->>'nom', data->>'ref' into av, ap, nm, rf;
  if not found then return null; end if;
  return jsonb_build_object('avant', av, 'apres', ap, 'nom', nm, 'ref', rf);
end $$;

revoke execute on function public.stock_maj(text, numeric), public.mes_roles(), public.niveau(text) from anon;
grant execute on function public.stock_maj(text, numeric), public.mes_roles(), public.niveau(text) to authenticated;

select 'script 3 installé' as resultat;
