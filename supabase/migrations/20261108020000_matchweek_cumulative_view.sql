-- Migration: 20261108020000_matchweek_cumulative_view.sql
-- Description: Derives matchweek per league as nth league match played by team, ordered by date.
-- Creates player_matchweek_cumulative and player_race_summary views.

-- 1. Derive and store nth league match in player_matches
alter table player_matches add column if not exists matchweek integer;

with team_matches as (
  select distinct league, team, game_id, date
  from player_matches
),
team_match_order as (
  select league, team, game_id,
    row_number() over (partition by league, team order by date, game_id) as nth_match
  from team_matches
)
update player_matches pm
set matchweek = tmo.nth_match
from team_match_order tmo
where pm.league = tmo.league and pm.team = tmo.team and pm.game_id = tmo.game_id;

create index if not exists idx_player_matches_matchweek on player_matches (matchweek);
create index if not exists idx_player_matches_player_mw on player_matches (player_id, matchweek);
create index if not exists idx_player_matches_league_mw on player_matches (league, matchweek);

-- 2. player_matchweek_cumulative view:
-- Derives player's matchweek from the nth league match played by their team, carrying forward cumulative stats.
create or replace view player_matchweek_cumulative as
with team_matches as (
  select distinct league, team, game_id, date
  from player_matches
),
team_fixtures as (
  select
    league,
    team,
    game_id,
    date,
    row_number() over (partition by league, team order by date, game_id) as matchweek
  from team_matches
),
player_matches_with_mw as (
  select
    pm.player_id,
    pm.player as name,
    pm.team,
    pm.league,
    pm.position,
    tf.matchweek,
    pm.total_goals,
    pm.goal_assists,
    pm.total_shots,
    pm.starter,
    pm.sub_ins,
    pm.appearances
  from player_matches pm
  join team_fixtures tf on pm.league = tf.league and pm.team = tf.team and pm.game_id = tf.game_id
),
league_max_mw as (
  select league, max(matchweek) as max_mw
  from team_fixtures
  group by league
),
all_matchweeks as (
  select generate_series(1, 12) as matchweek
),
active_players as (
  select distinct
    p.player_id,
    p.name,
    p.team,
    p.league,
    p.position,
    p.position_category
  from players p
  join player_matches pm on p.player_id = pm.player_id
),
player_mw_grid as (
  select
    ap.player_id,
    ap.name,
    ap.team,
    ap.league,
    ap.position,
    ap.position_category,
    mw.matchweek
  from active_players ap
  cross join all_matchweeks mw
  join league_max_mw lmm on ap.league = lmm.league
  where mw.matchweek <= lmm.max_mw
),
pm_grouped as (
  select
    player_id,
    matchweek,
    count(*) as games_played,
    sum(total_goals) as mw_goals,
    sum(goal_assists) as mw_assists,
    sum(total_goals + goal_assists) as mw_contributions,
    sum(total_shots) as mw_shots,
    sum(starter::int * 85 + sub_ins * 25) as mw_minutes,
    sum(appearances) as mw_appearances
  from player_matches_with_mw
  group by player_id, matchweek
),
grid_joined as (
  select
    g.player_id,
    g.name,
    g.team,
    g.league,
    g.position,
    g.position_category,
    g.matchweek,
    coalesce(pg.mw_goals, 0) as mw_goals,
    coalesce(pg.mw_assists, 0) as mw_assists,
    coalesce(pg.mw_contributions, 0) as mw_contributions,
    coalesce(pg.mw_shots, 0) as mw_shots,
    coalesce(pg.mw_minutes, 0) as mw_minutes,
    coalesce(pg.mw_appearances, 0) as mw_appearances,
    (pg.games_played is not null and pg.games_played > 0) as played_in_mw
  from player_mw_grid g
  left join pm_grouped pg on g.player_id = pg.player_id and g.matchweek = pg.matchweek
)
select
  player_id,
  name,
  team,
  league,
  position,
  position_category,
  matchweek,
  mw_goals,
  mw_assists,
  mw_contributions,
  mw_shots,
  mw_minutes,
  played_in_mw,
  sum(mw_goals) over (partition by player_id order by matchweek rows between unbounded preceding and current row)::int as cum_goals,
  sum(mw_assists) over (partition by player_id order by matchweek rows between unbounded preceding and current row)::int as cum_assists,
  sum(mw_contributions) over (partition by player_id order by matchweek rows between unbounded preceding and current row)::int as cum_contributions,
  sum(mw_shots) over (partition by player_id order by matchweek rows between unbounded preceding and current row)::int as cum_shots,
  sum(mw_minutes) over (partition by player_id order by matchweek rows between unbounded preceding and current row)::int as cum_minutes,
  sum(mw_appearances) over (partition by player_id order by matchweek rows between unbounded preceding and current row)::int as cum_appearances
from grid_joined;

grant select on player_matchweek_cumulative to anon, authenticated;

-- 3. player_race_summary view:
-- One row per player containing their full weekly progression array, preventing pagination truncation.
create or replace view player_race_summary as
with player_weeks as (
  select
    player_id,
    name,
    team,
    league,
    position,
    position_category,
    matchweek,
    mw_goals,
    mw_assists,
    mw_contributions,
    played_in_mw,
    cum_goals,
    cum_assists,
    cum_contributions,
    cum_minutes
  from player_matchweek_cumulative
),
player_aggregated as (
  select
    player_id,
    max(name) as name,
    max(team) as team,
    max(league) as league,
    max(position) as position,
    max(position_category) as position_category,
    max(cum_goals) as total_goals,
    max(cum_assists) as total_assists,
    max(cum_contributions) as total_contributions,
    max(cum_minutes) as total_minutes,
    count(*) filter (where played_in_mw and mw_contributions > 0) as matches_with_output,
    max(matchweek) as max_mw,
    jsonb_agg(
      jsonb_build_object(
        'mw', matchweek,
        'g', mw_goals,
        'a', mw_assists,
        'c', mw_contributions,
        'cum_g', cum_goals,
        'cum_a', cum_assists,
        'cum_c', cum_contributions,
        'cum_m', cum_minutes,
        'played', played_in_mw
      ) order by matchweek
    ) as weekly_series
  from player_weeks
  group by player_id
)
select *
from player_aggregated
where total_contributions > 0 or total_minutes >= 90;

grant select on player_race_summary to anon, authenticated;
