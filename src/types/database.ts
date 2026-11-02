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
