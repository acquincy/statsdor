-- Migration: 20261102000000_initial_schema.sql
-- Description: Core tables for player statistics, daily snapshots, and ingestion tracking.

-- 1. Main player season stats table
create table if not exists player_season_stats (
  player_id int not null,
  team_id int not null,
  league_id int not null,
  season int not null,
  name text not null,
  position text,
  appearances int default 0,
  minutes int default 0,
  goals int default 0,
  assists int default 0,
  key_passes int default 0,
  shots int default 0,
  shots_on int default 0,
  dribbles_success int default 0,
  tackles int default 0,
  duels_won int default 0,
  yellow int default 0,
  red int default 0,
  rating numeric,
  raw jsonb,
  updated_at timestamptz default now(),
  primary key (player_id, team_id, league_id, season)
);

-- 2. Daily / historical snapshots for cumulative charts over time
create table if not exists player_stats_snapshots (
  player_id int not null,
  team_id int not null,
  league_id int not null,
  season int not null,
  snapshot_date date not null default current_date,
  name text not null,
  position text,
  appearances int default 0,
  minutes int default 0,
  goals int default 0,
  assists int default 0,
  key_passes int default 0,
  shots int default 0,
  shots_on int default 0,
  dribbles_success int default 0,
  tackles int default 0,
  duels_won int default 0,
  yellow int default 0,
  red int default 0,
  rating numeric,
  raw jsonb,
  updated_at timestamptz default now(),
  primary key (player_id, team_id, league_id, season, snapshot_date)
);

-- 3. Ingestion tracking table for resumable pagination and quota safety
create table if not exists ingestion_runs (
  id bigserial primary key,
  league_id int not null,
  season int not null,
  last_completed_page int default 0,
  total_pages int,
  status text not null default 'running', -- 'running' | 'partial' | 'complete' | 'failed'
  started_at timestamptz default now(),
  finished_at timestamptz
);

-- Indexes for performance
create index if not exists idx_player_season_stats_league_season on player_season_stats (league_id, season);
create index if not exists idx_player_season_stats_name on player_season_stats (name);
create index if not exists idx_player_snapshots_lookup on player_stats_snapshots (player_id, league_id, season, snapshot_date);
create index if not exists idx_ingestion_runs_lookup on ingestion_runs (league_id, season, status);

-- Enable Row Level Security (RLS)
alter table player_season_stats enable row level security;
alter table player_stats_snapshots enable row level security;
alter table ingestion_runs enable row level security;

-- Read-only policy for anon/public users
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
