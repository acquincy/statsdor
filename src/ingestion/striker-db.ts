import postgres from 'postgres';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { StrikerPlayerSeasonRow } from '../schemas/striker';

export function getDbConnection() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    return null;
  }
  return postgres(connectionString, {
    ssl: 'require',
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function upsertStrikerStats(
  rows: StrikerPlayerSeasonRow[],
  snapshotDate: string = new Date().toISOString().slice(0, 10)
): Promise<{ upsertedStats: number; upsertedSnapshots: number }> {
  if (rows.length === 0) return { upsertedStats: 0, upsertedSnapshots: 0 };

  const sql = getDbConnection();
  if (sql) {
    try {
      // 1. Upsert player_season_stats via postgres driver
      await sql`
        insert into player_season_stats ${sql(
          rows.map((r) => ({
            player_id: r.player_id,
            team: r.team,
            team_id: r.team_id,
            league: r.league,
            season: r.season,
            name: r.name,
            position: r.position,
            appearances: r.appearances,
            starts: r.starts,
            minutes: r.minutes,
            goals: r.goals,
            assists: r.assists,
            shots: r.shots,
            shots_on_target: r.shots_on_target,
            xg: r.xg,
            yellow: r.yellow,
            red: r.red,
            saves: r.saves,
            clean_sheets: r.clean_sheets,
            goals_per90: r.goals_per90,
            assists_per90: r.assists_per90,
            shots_per90: r.shots_per90,
            xg_per90: r.xg_per90,
            raw: sql.json(r.raw as any),
            updated_at: sql`now()`,
          }))
        )}
        on conflict (player_id, team, league, season)
        do update set
          name = excluded.name,
          position = excluded.position,
          team_id = excluded.team_id,
          appearances = excluded.appearances,
          starts = excluded.starts,
          minutes = excluded.minutes,
          goals = excluded.goals,
          assists = excluded.assists,
          shots = excluded.shots,
          shots_on_target = excluded.shots_on_target,
          xg = excluded.xg,
          yellow = excluded.yellow,
          red = excluded.red,
          saves = excluded.saves,
          clean_sheets = excluded.clean_sheets,
          goals_per90 = excluded.goals_per90,
          assists_per90 = excluded.assists_per90,
          shots_per90 = excluded.shots_per90,
          xg_per90 = excluded.xg_per90,
          raw = excluded.raw,
          updated_at = now()
      `;

      // 2. Upsert player_stats_snapshots via postgres driver
      await sql`
        insert into player_stats_snapshots ${sql(
          rows.map((r) => ({
            player_id: r.player_id,
            team: r.team,
            team_id: r.team_id,
            league: r.league,
            season: r.season,
            snapshot_date: snapshotDate,
            name: r.name,
            position: r.position,
            appearances: r.appearances,
            starts: r.starts,
            minutes: r.minutes,
            goals: r.goals,
            assists: r.assists,
            shots: r.shots,
            shots_on_target: r.shots_on_target,
            xg: r.xg,
            yellow: r.yellow,
            red: r.red,
            saves: r.saves,
            clean_sheets: r.clean_sheets,
            goals_per90: r.goals_per90,
            assists_per90: r.assists_per90,
            shots_per90: r.shots_per90,
            xg_per90: r.xg_per90,
            raw: sql.json(r.raw as any),
            updated_at: sql`now()`,
          }))
        )}
        on conflict (player_id, team, league, season, snapshot_date)
        do update set
          name = excluded.name,
          position = excluded.position,
          team_id = excluded.team_id,
          appearances = excluded.appearances,
          starts = excluded.starts,
          minutes = excluded.minutes,
          goals = excluded.goals,
          assists = excluded.assists,
          shots = excluded.shots,
          shots_on_target = excluded.shots_on_target,
          xg = excluded.xg,
          yellow = excluded.yellow,
          red = excluded.red,
          saves = excluded.saves,
          clean_sheets = excluded.clean_sheets,
          goals_per90 = excluded.goals_per90,
          assists_per90 = excluded.assists_per90,
          shots_per90 = excluded.shots_per90,
          xg_per90 = excluded.xg_per90,
          raw = excluded.raw,
          updated_at = now()
      `;

      return { upsertedStats: rows.length, upsertedSnapshots: rows.length };
    } finally {
      await sql.end();
    }
  }

  // Fallback to Supabase service-role client if direct connection is not set
  const supabase = getSupabaseAdminClient();
  if (supabase) {
    const { error: statsError } = await supabase.from('player_season_stats').upsert(
      rows.map((r) => ({
        ...r,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'player_id,team,league,season' }
    );
    if (statsError) throw statsError;

    const { error: snapError } = await supabase.from('player_stats_snapshots').upsert(
      rows.map((r) => ({
        ...r,
        snapshot_date: snapshotDate,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'player_id,team,league,season,snapshot_date' }
    );
    if (snapError) throw snapError;

    return { upsertedStats: rows.length, upsertedSnapshots: rows.length };
  }

  throw new Error(
    'No database connection found. Set either SUPABASE_DB_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'
  );
}
