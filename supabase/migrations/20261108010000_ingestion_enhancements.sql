-- Migration: 20261108010000_ingestion_enhancements.sql
-- Description: Ingestion runs tracking columns, storage bucket for raw snapshots, and fast count views for sanity checks.

-- 1. Enhance ingestion_runs table
alter table ingestion_runs
  add column if not exists matches_fetched int default 0,
  add column if not exists rows_upserted int default 0,
  add column if not exists timestamp timestamptz default now(),
  add column if not exists error_message text;

-- Ensure RLS allows insert and update for ingestion jobs
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ingestion_runs' and policyname = 'Allow insert on ingestion_runs') then
    create policy "Allow insert on ingestion_runs" on ingestion_runs for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ingestion_runs' and policyname = 'Allow update on ingestion_runs') then
    create policy "Allow update on ingestion_runs" on ingestion_runs for update to anon, authenticated using (true) with check (true);
  end if;
end $$;

-- 2. Create raw-snapshots storage bucket
insert into storage.buckets (id, name, public)
values ('raw-snapshots', 'raw-snapshots', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'Allow insert on raw-snapshots') then
    create policy "Allow insert on raw-snapshots" on storage.objects for insert to anon, authenticated with check (bucket_id = 'raw-snapshots');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'Allow select on raw-snapshots') then
    create policy "Allow select on raw-snapshots" on storage.objects for select to anon, authenticated using (bucket_id = 'raw-snapshots');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'Allow update on raw-snapshots') then
    create policy "Allow update on raw-snapshots" on storage.objects for update to anon, authenticated using (bucket_id = 'raw-snapshots');
  end if;
end $$;

-- 3. Views for fast baseline and post-run sanity checking
create or replace view match_summary_counts as
select
  count(distinct game_id) as total_games,
  count(*) as total_rows
from player_matches;

create or replace view league_match_counts as
select
  league,
  count(distinct game_id) as games,
  count(*) as row_count
from player_matches
group by league;

grant select on match_summary_counts to anon, authenticated;
grant select on league_match_counts to anon, authenticated;
