import { z } from 'zod';

// Helper to coerce null/undefined numbers to 0
const nullToZero = z.preprocess((val) => (val === null || val === undefined ? 0 : val), z.number());

// Helper for numeric rating (can be string like "6.964516" or null)
const coerceRating = z.preprocess((val) => {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(num) ? null : num;
}, z.number().nullable());

export const ApiPlayerProfileSchema = z.object({
  id: z.number(),
  name: z.string(),
  firstname: z.string().nullable().optional(),
  lastname: z.string().nullable().optional(),
  age: z.number().nullable().optional(),
  birth: z
    .object({
      date: z.string().nullable().optional(),
      place: z.string().nullable().optional(),
      country: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  nationality: z.string().nullable().optional(),
  height: z.string().nullable().optional(),
  weight: z.string().nullable().optional(),
  injured: z.boolean().nullable().optional(),
  photo: z.string().nullable().optional(),
});

export const ApiStatisticSchema = z.object({
  team: z.object({
    id: z.number(),
    name: z.string(),
    logo: z.string().nullable().optional(),
  }),
  league: z.object({
    id: z.number(),
    name: z.string(),
    country: z.string().nullable().optional(),
    logo: z.string().nullable().optional(),
    flag: z.string().nullable().optional(),
    season: z.number(),
  }),
  games: z.object({
    appearences: nullToZero,
    lineups: nullToZero.optional(),
    minutes: nullToZero,
    number: z.number().nullable().optional(),
    position: z.string().nullable().default('Unknown'),
    rating: coerceRating,
    captain: z.boolean().nullable().optional(),
  }),
  substitutes: z
    .object({
      in: nullToZero.optional(),
      out: nullToZero.optional(),
      bench: nullToZero.optional(),
    })
    .optional(),
  shots: z
    .object({
      total: nullToZero,
      on: nullToZero,
    })
    .default({ total: 0, on: 0 }),
  goals: z
    .object({
      total: nullToZero,
      conceded: nullToZero.optional(),
      assists: nullToZero,
      saves: nullToZero.optional(),
    })
    .default({ total: 0, assists: 0 }),
  passes: z
    .object({
      total: nullToZero.optional(),
      key: nullToZero,
      accuracy: nullToZero.optional(),
    })
    .default({ key: 0 }),
  tackles: z
    .object({
      total: nullToZero,
      blocks: nullToZero.optional(),
      interceptions: nullToZero.optional(),
    })
    .default({ total: 0 }),
  duels: z
    .object({
      total: nullToZero.optional(),
      won: nullToZero,
    })
    .default({ won: 0 }),
  dribbles: z
    .object({
      attempts: nullToZero.optional(),
      success: nullToZero,
      past: nullToZero.optional(),
    })
    .default({ success: 0 }),
  fouls: z
    .object({
      drawn: nullToZero.optional(),
      committed: nullToZero.optional(),
    })
    .optional(),
  cards: z
    .object({
      yellow: nullToZero,
      yellowred: nullToZero.optional(),
      red: nullToZero,
    })
    .default({ yellow: 0, red: 0 }),
  penalty: z
    .object({
      won: nullToZero.optional(),
      commited: nullToZero.optional(),
      scored: nullToZero.optional(),
      missed: nullToZero.optional(),
      saved: nullToZero.optional(),
    })
    .optional(),
});

export const ApiPlayerItemSchema = z.object({
  player: ApiPlayerProfileSchema,
  statistics: z.array(ApiStatisticSchema),
});

export const ApiPagingSchema = z.object({
  current: z.number(),
  total: z.number(),
});

export const ApiPlayersResponseSchema = z.object({
  get: z.string(),
  parameters: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  errors: z.union([z.array(z.string()), z.record(z.string(), z.string())]),
  results: z.number(),
  paging: ApiPagingSchema,
  response: z.array(ApiPlayerItemSchema),
});

export type ApiPlayerProfile = z.infer<typeof ApiPlayerProfileSchema>;
export type ApiStatistic = z.infer<typeof ApiStatisticSchema>;
export type ApiPlayerItem = z.infer<typeof ApiPlayerItemSchema>;
export type ApiPlayersResponse = z.infer<typeof ApiPlayersResponseSchema>;

// Clean database row type representing player_season_stats
export interface PlayerSeasonStatRow {
  player_id: number;
  team_id: number;
  league_id: number;
  season: number;
  name: string;
  position: string;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  key_passes: number;
  shots: number;
  shots_on: number;
  dribbles_success: number;
  tackles: number;
  duels_won: number;
  yellow: number;
  red: number;
  rating: number | null;
  raw: unknown;
  updated_at?: string;
}

export function transformPlayerToRows(item: ApiPlayerItem): PlayerSeasonStatRow[] {
  return item.statistics.map((stat) => ({
    player_id: item.player.id,
    team_id: stat.team.id,
    league_id: stat.league.id,
    season: stat.league.season,
    name: item.player.name,
    position: stat.games.position || 'Unknown',
    appearances: stat.games.appearences,
    minutes: stat.games.minutes,
    goals: stat.goals.total,
    assists: stat.goals.assists,
    key_passes: stat.passes.key,
    shots: stat.shots.total,
    shots_on: stat.shots.on,
    dribbles_success: stat.dribbles.success,
    tackles: stat.tackles.total,
    duels_won: stat.duels.won,
    yellow: stat.cards.yellow,
    red: stat.cards.red,
    rating: stat.games.rating,
    raw: {
      player: item.player,
      statistic: stat,
    },
  }));
}
