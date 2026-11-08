-- Migration: 20261108000000_match_player_schema.sql
-- Description: Match-centric architecture: players registry, player_matches log, and derived season stats views.

-- 1. Players registry table
create table if not exists players (
  player_id text primary key,
  name text not null,
  team text not null,
  league text not null,
  position text not null default 'Substitute',
  position_category text not null default 'Other',
  jersey int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for players
create index if not exists idx_players_name on players (name);
create index if not exists idx_players_team on players (team);
create index if not exists idx_players_league on players (league);
create index if not exists idx_players_position on players (position);
create index if not exists idx_players_pos_category on players (position_category);

-- Enable RLS for players
alter table players enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'players' and policyname = 'Allow public read access on players') then
    create policy "Allow public read access on players" on players for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'players' and policyname = 'Allow insert on players') then
    create policy "Allow insert on players" on players for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'players' and policyname = 'Allow update on players') then
    create policy "Allow update on players" on players for update to anon, authenticated using (true) with check (true);
  end if;
end $$;

-- 2. Player match logs table
create table if not exists player_matches (
  game_id text not null,
  player_id text not null references players(player_id) on delete cascade,
  league text not null,
  season int not null default 2026,
  date date not null,
  game text not null,
  team text not null,
  is_home boolean default false,
  player text not null,
  position text,
  starter boolean default false,
  jersey int,
  appearances int default 0,
  sub_ins int default 0,
  total_goals int default 0,
  goal_assists int default 0,
  total_shots int default 0,
  shots_on_target int default 0,
  fouls_committed int default 0,
  fouls_suffered int default 0,
  yellow_cards int default 0,
  red_cards int default 0,
  offsides int default 0,
  own_goals int default 0,
  saves int default 0,
  goals_conceded int default 0,
  shots_faced int default 0,

  -- Generated alias columns to match exact casing from user snippet:
  "subIns" int generated always as (sub_ins) stored,
  "totalGoals" int generated always as (total_goals) stored,
  "goalAssists" int generated always as (goal_assists) stored,
  "totalShots" int generated always as (total_shots) stored,
  "shotsOnTarget" int generated always as (shots_on_target) stored,
  "foulsCommitted" int generated always as (fouls_committed) stored,
  "foulsSuffered" int generated always as (fouls_suffered) stored,
  "yellowCards" int generated always as (yellow_cards) stored,
  "redCards" int generated always as (red_cards) stored,
  "ownGoals" int generated always as (own_goals) stored,
  "goalsConceded" int generated always as (goals_conceded) stored,
  "shotsFaced" int generated always as (shots_faced) stored,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (game_id, player_id)
);

-- Indexes for querying player_matches
create index if not exists idx_player_matches_player_id on player_matches (player_id);
create index if not exists idx_player_matches_team on player_matches (team);
create index if not exists idx_player_matches_league_season on player_matches (league, season);
create index if not exists idx_player_matches_date on player_matches (date);
create index if not exists idx_player_matches_player_date on player_matches (player_id, date);

-- Enable RLS for player_matches
alter table player_matches enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'player_matches' and policyname = 'Allow public read access on player_matches') then
    create policy "Allow public read access on player_matches" on player_matches for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'player_matches' and policyname = 'Allow insert on player_matches') then
    create policy "Allow insert on player_matches" on player_matches for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'player_matches' and policyname = 'Allow update on player_matches') then
    create policy "Allow update on player_matches" on player_matches for update to anon, authenticated using (true) with check (true);
  end if;
end $$;

-- 3. Derived Views

-- View A: player_team_season_stats (keyed by player_id, team, league, season)
-- Keyed on (player_id, team) for transferred players
create or replace view player_team_season_stats as
select
  pm.player_id,
  pm.team,
  pm.league,
  pm.season,
  p.name,
  p.position,
  p.position_category,
  sum(pm.appearances) as apps,
  sum(pm.starter::int) as starts,
  sum(pm.sub_ins) as sub_ins,
  sum(pm.total_goals) as goals,
  sum(pm.goal_assists) as assists,
  sum(pm.total_shots) as shots,
  sum(pm.shots_on_target) as sot,
  -- Analytical calculations in view
  case
    when sum(pm.total_shots) > 0 then
      round((sum(pm.shots_on_target)::numeric / sum(pm.total_shots)) * 100, 1)
    else 0.0
  end as shooting_accuracy,
  case
    when sum(pm.total_shots) > 0 then
      round((sum(pm.total_goals)::numeric / sum(pm.total_shots)) * 100, 1)
    else 0.0
  end as conversion_rate,
  (sum(pm.total_goals) + sum(pm.goal_assists)) as goal_contributions,
  sum(pm.fouls_committed) as fouls_committed,
  sum(pm.fouls_suffered) as fouls_suffered,
  sum(pm.yellow_cards) as yellow_cards,
  sum(pm.red_cards) as red_cards,
  sum(pm.offsides) as offsides,
  sum(pm.own_goals) as own_goals,
  sum(pm.saves) as saves,
  case
    when p.position ilike '%Goalkeeper%' then sum(pm.goals_conceded)
    else 0
  end as goals_conceded,
  sum(pm.shots_faced) as shots_faced
from player_matches pm
join players p on pm.player_id = p.player_id
group by pm.player_id, pm.team, pm.league, pm.season, p.name, p.position, p.position_category;

-- View B: player_season_totals (keyed by player_id, season)
-- Powers the StatsDor Next.js frontend leaderboards, profile, and comparison tools
create or replace view player_season_totals as
select
  pm.player_id,
  pm.season,
  max(pm.league) as league,
  p.name,
  string_agg(distinct pm.team, ', ') as teams,
  p.position,
  sum(pm.appearances) as appearances,
  sum(pm.starter::int) as starts,
  -- Estimated minutes (starts * 85 + sub_ins * 25)
  (sum(pm.starter::int) * 85 + sum(pm.sub_ins) * 25) as minutes,
  sum(pm.total_goals) as goals,
  sum(pm.goal_assists) as assists,
  sum(pm.total_shots) as shots,
  sum(pm.shots_on_target) as shots_on_target,
  0.0::numeric as xg,
  sum(pm.yellow_cards) as yellow,
  sum(pm.red_cards) as red,
  0::bigint as clean_sheets,
  sum(pm.saves) as saves,
  case
    when (sum(pm.starter::int) * 85 + sum(pm.sub_ins) * 25) > 0 then
      round((sum(pm.total_goals)::numeric / (sum(pm.starter::int) * 85 + sum(pm.sub_ins) * 25)) * 90, 2)
    else 0.0
  end as goals_per90,
  case
    when (sum(pm.starter::int) * 85 + sum(pm.sub_ins) * 25) > 0 then
      round((sum(pm.goal_assists)::numeric / (sum(pm.starter::int) * 85 + sum(pm.sub_ins) * 25)) * 90, 2)
    else 0.0
  end as assists_per90,
  0.0::numeric as xg_per90,
  max(pm.updated_at) as updated_at
from player_matches pm
join players p on pm.player_id = p.player_id
group by pm.player_id, pm.season, p.name, p.position;
