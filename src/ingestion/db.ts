import postgres from 'postgres';
import { PlayerSeasonStatRow } from '../schemas/api-football';

export function getDbConnection() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL is not set in environment.');
  }

  return postgres(connectionString, {
    ssl: 'require',
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export async function upsertPlayerStats(
  sql: postgres.Sql,
  rows: PlayerSeasonStatRow[],
  snapshotDate: string = new Date().toISOString().slice(0, 10)
): Promise<{ upsertedStats: number; upsertedSnapshots: number }> {
  if (rows.length === 0) return { upsertedStats: 0, upsertedSnapshots: 0 };

  // 1. Upsert into player_season_stats
  const statsResult = await sql`
    insert into player_season_stats ${sql(
      rows.map((r) => ({
        player_id: r.player_id,
        team_id: r.team_id,
        league_id: r.league_id,
        season: r.season,
        name: r.name,
        position: r.position,
        appearances: r.appearances,
        minutes: r.minutes,
        goals: r.goals,
        assists: r.assists,
        key_passes: r.key_passes,
        shots: r.shots,
        shots_on: r.shots_on,
        dribbles_success: r.dribbles_success,
        tackles: r.tackles,
        duels_won: r.duels_won,
        yellow: r.yellow,
        red: r.red,
        rating: r.rating,
        raw: sql.json(r.raw as any),
        updated_at: sql`now()`,
      }))
    )}
    on conflict (player_id, team_id, league_id, season)
    do update set
      name = excluded.name,
      position = excluded.position,
      appearances = excluded.appearances,
      minutes = excluded.minutes,
      goals = excluded.goals,
      assists = excluded.assists,
      key_passes = excluded.key_passes,
      shots = excluded.shots,
      shots_on = excluded.shots_on,
      dribbles_success = excluded.dribbles_success,
      tackles = excluded.tackles,
      duels_won = excluded.duels_won,
      yellow = excluded.yellow,
      red = excluded.red,
      rating = excluded.rating,
      raw = excluded.raw,
      updated_at = now()
  `;

  // 2. Upsert into player_stats_snapshots
  const snapshotsResult = await sql`
    insert into player_stats_snapshots ${sql(
      rows.map((r) => ({
        player_id: r.player_id,
        team_id: r.team_id,
        league_id: r.league_id,
        season: r.season,
        snapshot_date: snapshotDate,
        name: r.name,
        position: r.position,
        appearances: r.appearances,
        minutes: r.minutes,
        goals: r.goals,
        assists: r.assists,
        key_passes: r.key_passes,
        shots: r.shots,
        shots_on: r.shots_on,
        dribbles_success: r.dribbles_success,
        tackles: r.tackles,
        duels_won: r.duels_won,
        yellow: r.yellow,
        red: r.red,
        rating: r.rating,
        raw: sql.json(r.raw as any),
        updated_at: sql`now()`,
      }))
    )}
    on conflict (player_id, team_id, league_id, season, snapshot_date)
    do update set
      name = excluded.name,
      position = excluded.position,
      appearances = excluded.appearances,
      minutes = excluded.minutes,
      goals = excluded.goals,
      assists = excluded.assists,
      key_passes = excluded.key_passes,
      shots = excluded.shots,
      shots_on = excluded.shots_on,
      dribbles_success = excluded.dribbles_success,
      tackles = excluded.tackles,
      duels_won = excluded.duels_won,
      yellow = excluded.yellow,
      red = excluded.red,
      rating = excluded.rating,
      raw = excluded.raw,
      updated_at = now()
  `;

  return {
    upsertedStats: rows.length,
    upsertedSnapshots: rows.length,
  };
}

export interface IngestionRunRecord {
  id: number;
  league_id: number;
  season: number;
  last_completed_page: number;
  total_pages: number | null;
  status: 'running' | 'partial' | 'complete' | 'failed';
}

export async function getOrCreateRun(
  sql: postgres.Sql,
  leagueId: number,
  season: number
): Promise<IngestionRunRecord> {
  // Check for an existing partial or running run from today
  const existing = await sql<IngestionRunRecord[]>`
    select id, league_id, season, last_completed_page, total_pages, status
    from ingestion_runs
    where league_id = ${leagueId}
      and season = ${season}
      and status in ('running', 'partial')
    order by started_at desc
    limit 1
  `;

  if (existing.length > 0) {
    return existing[0];
  }

  // Create new run
  const inserted = await sql<IngestionRunRecord[]>`
    insert into ingestion_runs (league_id, season, last_completed_page, status)
    values (${leagueId}, ${season}, 0, 'running')
    returning id, league_id, season, last_completed_page, total_pages, status
  `;

  return inserted[0];
}

export async function updateRunProgress(
  sql: postgres.Sql,
  runId: number,
  lastCompletedPage: number,
  totalPages: number,
  status: 'running' | 'partial' | 'complete' | 'failed'
): Promise<void> {
  const finished = status === 'complete' || status === 'failed';
  await sql`
    update ingestion_runs
    set
      last_completed_page = ${lastCompletedPage},
      total_pages = ${totalPages},
      status = ${status},
      finished_at = ${finished ? sql`now()` : null}
    where id = ${runId}
  `;
}
