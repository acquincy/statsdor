export interface Player {
  player_id: string;
  name: string;
  team: string;
  league: string;
  position: string;
  position_category: string;
  jersey?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface PlayerMatch {
  game_id: string;
  player_id: string;
  league: string;
  season: number;
  matchweek?: number;
  date: string;
  game: string;
  team: string;
  is_home: boolean;
  player: string;
  position: string;
  starter: boolean;
  jersey?: number | null;
  appearances: number;
  sub_ins: number;
  total_goals: number;
  goal_assists: number;
  total_shots: number;
  shots_on_target: number;
  fouls_committed: number;
  fouls_suffered: number;
  yellow_cards: number;
  red_cards: number;
  offsides: number;
  own_goals: number;
  saves: number;
  goals_conceded: number;
  shots_faced: number;
  created_at?: string;
  updated_at?: string;
}

export interface PlayerTeamSeasonStat {
  player_id: string;
  team: string;
  league: string;
  season: number;
  name: string;
  position: string;
  position_category: string;
  apps: number;
  starts: number;
  sub_ins: number;
  goals: number;
  assists: number;
  shots: number;
  sot: number;
  shooting_accuracy: number;
  conversion_rate: number;
  goal_contributions: number;
  fouls_committed: number;
  fouls_suffered: number;
  yellow_cards: number;
  red_cards: number;
  offsides: number;
  own_goals: number;
  saves: number;
  goals_conceded: number;
  shots_faced: number;
}

export interface PlayerSeasonTotal {
  player_id: string;
  season: number;
  league: string;
  name: string;
  teams: string;
  position: string;
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shots_on_target: number;
  xg: number;
  yellow: number;
  red: number;
  clean_sheets: number;
  saves: number;
  goals_per90: number;
  assists_per90: number;
  xg_per90: number;
  shooting_accuracy?: number;
  conversion_rate?: number;
  goal_contributions?: number;
  updated_at: string;
}

export interface PlayerStatsSnapshot {
  player_id: string;
  team: string;
  team_id: string | null;
  league: string;
  season: number;
  snapshot_date: string;
  name: string;
  position: string;
  appearances: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  shots_on_target: number;
  xg: number;
  yellow: number;
  red: number;
  saves: number;
  clean_sheets: number;
  goals_per90: number;
  assists_per90: number;
  shots_per90: number;
  xg_per90: number;
  updated_at: string;
}

export interface IngestionRun {
  id: number;
  league: string;
  season: number;
  status: 'running' | 'partial' | 'complete' | 'failed';
  started_at: string;
  finished_at?: string | null;
  matches_fetched: number;
  rows_upserted: number;
  timestamp: string;
  error_message?: string | null;
}

export interface PlayerMatchweekStat {
  player_id: string;
  name: string;
  team: string;
  league: string;
  position: string;
  position_category: string;
  matchweek: number;
  mw_goals: number;
  mw_assists: number;
  mw_contributions: number;
  mw_shots: number;
  mw_minutes: number;
  played_in_mw: boolean;
  cum_goals: number;
  cum_assists: number;
  cum_contributions: number;
  cum_shots: number;
  cum_minutes: number;
  cum_appearances: number;
}

export interface WeeklyPoint {
  mw: number;
  g: number;
  a: number;
  c: number;
  cum_g: number;
  cum_a: number;
  cum_c: number;
  cum_m: number;
  played: boolean;
}

export interface PlayerRaceSummary {
  player_id: string;
  name: string;
  team: string;
  league: string;
  position: string;
  position_category: string;
  total_goals: number;
  total_assists: number;
  total_contributions: number;
  total_minutes: number;
  matches_with_output: number;
  max_mw: number;
  weekly_series: WeeklyPoint[];
}



