-- =====================================================================
--  CASA-ELECT · Script 4 : ouverture rapide (ne télécharger que ce qui a changé)
--  À coller dans Supabase → SQL Editor → New query → Run (après les scripts 1, 2 et 3).
--  Peut être relancé sans risque.
-- =====================================================================

-- 1. Index pour retrouver vite les fiches modifiées depuis la dernière ouverture
create index if not exists docs_col_modif_idx on public.docs (col, modifie_le);

-- 2. Liste des fiches supprimées (sans leur contenu) : chaque appareil retire aussi de sa copie locale
create table if not exists public.supprimes (col text not null, id text not null, le timestamptz not null default now(), primary key (col, id));
create index if not exists supprimes_le_idx on public.supprimes (col, le);
alter table public.supprimes enable row level security;
drop policy if exists "supprimes : lire" on public.supprimes;
create policy "supprimes : lire" on public.supprimes for select to authenticated using (public.peut(col, id, false));
revoke all on public.supprimes from anon;
grant select on public.supprimes to authenticated;

create or replace function public.note_suppression() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.supprimes (col, id, le) values (old.col, old.id, now())
  on conflict (col, id) do update set le = excluded.le;
  return old;
end $$;
drop trigger if exists docs_supprimes on public.docs;
create trigger docs_supprimes after delete on public.docs for each row execute function public.note_suppression();

-- Une fiche recréée après suppression n'est plus « supprimée »
create or replace function public.annule_suppression() returns trigger
language plpgsql security definer set search_path = public as $$
begin delete from public.supprimes where col = new.col and id = new.id; return new; end $$;
drop trigger if exists docs_recree on public.docs;
create trigger docs_recree after insert on public.docs for each row execute function public.annule_suppression();

-- Ménage : on garde 6 mois de suppressions
delete from public.supprimes where le < now() - interval '6 months';

select 'script 4 installé' as resultat;
