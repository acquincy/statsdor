import { z } from 'zod';

const nullToZero = z.preprocess((val) => (val === null || val === undefined ? 0 : val), z.number());
const nullToString = z.preprocess((val) => (val === null || val === undefined ? '' : String(val)), z.string());

export const StrikerPlayerProfileSchema = z.object({
  player_id: z.string(),
  name: z.string(),
  short_name: z.string().nullable().optional(),
  position: z.string().nullable().default('Unknown'),
  jersey: z.string().nullable().optional(),
  team_id: z.string().nullable().optional(),
  team: z.string(),
  team_name: z.string().nullable().optional(),
});

export const StrikerSeasonStatsSchema = z.object({
  season: z.number(),
  team: z.string(),
  appearances: nullToZero,
  starts: nullToZero,
  minutes: nullToZero,
  goals: nullToZero,
  assists: nullToZero,
  shots: nullToZero,
  shots_on_target: nullToZero,
  xg: nullToZero,
  yellow_cards: nullToZero,
  red_cards: nullToZero,
  saves: nullToZero,
  goals_conceded: nullToZero,
  clean_sheets: nullToZero,
  goals_per90: nullToZero,
  assists_per90: nullToZero,
  shots_per90: nullToZero,
  xg_per90: nullToZero,
});

export const StrikerRecentGameSchema = z.object({
  game_id: z.string(),
  game_date: z.string(),
  season: z.number(),
  team_id: z.string().nullable().optional(),
  team: z.string(),
  opponent: z.string(),
  home: z.boolean().default(false),
  goals_for: nullToZero,
  goals_against: nullToZero,
  starter: z.boolean().default(false),
  minute_on: z.number().nullable().optional(),
  minute_off: z.number().nullable().optional(),
  minutes: nullToZero,
  goals: nullToZero,
  assists: nullToZero,
  shots: nullToZero,
  shots_on_target: nullToZero,
  xg: nullToZero,
  yellow_cards: nullToZero,
  red_cards: nullToZero,
  saves: nullToZero,
});

export const StrikerPlayerResponseSchema = z.object({
  data: z.object({
    player: StrikerPlayerProfileSchema,
    seasons: z.array(StrikerSeasonStatsSchema),
    recent_games: z.array(StrikerRecentGameSchema).optional().default([]),
  }),
});

export const StrikerSquadItemSchema = z.object({
  player_id: z.string(),
  name: z.string(),
  team_id: z.string().nullable().optional(),
  team: z.string(),
  position: z.string().nullable().default('Unknown'),
  jersey: z.string().nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  age: z.number().nullable().optional(),
  citizenship: z.string().nullable().optional(),
  height_in: z.number().nullable().optional(),
  weight_lb: z.number().nullable().optional(),
  appearances: nullToZero,
});

export const StrikerSquadResponseSchema = z.object({
  data: z.object({
    players: z.array(StrikerSquadItemSchema),
  }),
});

export type StrikerPlayerProfile = z.infer<typeof StrikerPlayerProfileSchema>;
export type StrikerSeasonStats = z.infer<typeof StrikerSeasonStatsSchema>;
export type StrikerRecentGame = z.infer<typeof StrikerRecentGameSchema>;
export type StrikerPlayerResponse = z.infer<typeof StrikerPlayerResponseSchema>;
export type StrikerSquadItem = z.infer<typeof StrikerSquadItemSchema>;

export interface StrikerPlayerSeasonRow {
  player_id: string;
  team: string;
  team_id: string | null;
  league: string;
  season: number;
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
  raw: unknown;
  updated_at?: string;
}

export function transformStrikerPlayerToRows(
  data: StrikerPlayerResponse['data'],
  league: string = 'soccer'
): StrikerPlayerSeasonRow[] {
  const { player, seasons } = data;
  return seasons.map((s) => ({
    player_id: player.player_id,
    team: s.team || player.team,
    team_id: player.team_id || null,
    league,
    season: s.season,
    name: player.name,
    position: player.position || 'Unknown',
    appearances: s.appearances,
    starts: s.starts,
    minutes: s.minutes,
    goals: s.goals,
    assists: s.assists,
    shots: s.shots,
    shots_on_target: s.shots_on_target,
    xg: s.xg,
    yellow: s.yellow_cards,
    red: s.red_cards,
    saves: s.saves,
    clean_sheets: s.clean_sheets,
    goals_per90: s.goals_per90,
    assists_per90: s.assists_per90,
    shots_per90: s.shots_per90,
    xg_per90: s.xg_per90,
    raw: {
      player,
      season: s,
    },
  }));
}
