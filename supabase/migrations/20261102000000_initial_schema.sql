-- Migration: 20261102000000_initial_schema.sql
-- Description: Core tables for player statistics, daily snapshots, ingestion tracking, and views.

-- 1. Main player season stats table
create table if not exists player_season_stats (
  player_id text not null,
  team text not null,
  team_id text,
  league text not null default 'soccer',
  season int not null,
  name text not null,
  position text,
  appearances int default 0,
  starts int default 0,
  minutes int default 0,
  goals int default 0,
  assists int default 0,
  shots int default 0,
  shots_on_target int default 0,
  xg numeric default 0,
  yellow int default 0,
  red int default 0,
  saves int default 0,
  clean_sheets int default 0,
  goals_per90 numeric default 0,
  assists_per90 numeric default 0,
  shots_per90 numeric default 0,
  xg_per90 numeric default 0,
  raw jsonb,
  updated_at timestamptz default now(),
  primary key (player_id, team, league, season)
);

-- 2. Daily / historical snapshots for cumulative charts over time
create table if not exists player_stats_snapshots (
  player_id text not null,
  team text not null,
  team_id text,
  league text not null default 'soccer',
  season int not null,
  snapshot_date date not null default current_date,
  name text not null,
  position text,
  appearances int default 0,
  starts int default 0,
  minutes int default 0,
  goals int default 0,
  assists int default 0,
  shots int default 0,
  shots_on_target int default 0,
  xg numeric default 0,
  yellow int default 0,
  red int default 0,
  saves int default 0,
  clean_sheets int default 0,
  goals_per90 numeric default 0,
  assists_per90 numeric default 0,
  shots_per90 numeric default 0,
  xg_per90 numeric default 0,
  raw jsonb,
  updated_at timestamptz default now(),
  primary key (player_id, team, league, season, snapshot_date)
);

-- 3. Ingestion tracking table
create table if not exists ingestion_runs (
  id bigserial primary key,
  league text not null default 'soccer',
  season int not null,
  processed_count int default 0,
  status text not null default 'running', -- 'running' | 'partial' | 'complete' | 'failed'
  started_at timestamptz default now(),
  finished_at timestamptz
);

-- Indexes for querying performance
create index if not exists idx_player_season_stats_league_season on player_season_stats (league, season);
create index if not exists idx_player_season_stats_name on player_season_stats (name);
create index if not exists idx_player_season_stats_team on player_season_stats (team);
create index if not exists idx_player_snapshots_lookup on player_stats_snapshots (player_id, league, season, snapshot_date);
create index if not exists idx_ingestion_runs_lookup on ingestion_runs (league, season, status);

-- Enable Row Level Security (RLS)
alter table player_season_stats enable row level security;
alter table player_stats_snapshots enable row level security;
alter table ingestion_runs enable row level security;

-- Read-only policy for public/anon
create policy "Allow public read access on player_season_stats"
  on player_season_stats for select
  to anon, authenticated
  using (true);

create policy "Allow public read access on player_stats_snapshots"
  on player_stats_snapshots for select
  to anon, authenticated
  using (true);

create policy "Allow public read access on ingestion_runs"
  on ingestion_runs for select
  to anon, authenticated
  using (true);

-- 4. Derived SQL Views
-- View 1: player_season_totals (sums across clubs if a player transferred)
create or replace view player_season_totals as
select
  player_id,
  season,
  league,
  max(name) as name,
  string_agg(distinct team, ', ') as teams,
  max(position) as position,
  sum(appearances) as appearances,
  sum(starts) as starts,
  sum(minutes) as minutes,
  sum(goals) as goals,
  sum(assists) as assists,
  sum(shots) as shots,
  sum(shots_on_target) as shots_on_target,
  round(sum(xg), 2) as xg,
  sum(yellow) as yellow,
  sum(red) as red,
  sum(clean_sheets) as clean_sheets,
  sum(saves) as saves,
  case
    when sum(minutes) > 0 then round((sum(goals)::numeric / sum(minutes)) * 90, 2)
    else 0
  end as goals_per90,
  case
    when sum(minutes) > 0 then round((sum(assists)::numeric / sum(minutes)) * 90, 2)
    else 0
  end as assists_per90,
  case
    when sum(minutes) > 0 then round((sum(xg)::numeric / sum(minutes)) * 90, 2)
    else 0
  end as xg_per90,
  max(updated_at) as updated_at
from player_season_stats
group by player_id, season, league;
