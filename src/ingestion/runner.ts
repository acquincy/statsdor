import 'dotenv/config';
import { ApiFootballClient } from './client';
import { getDbConnection, getOrCreateRun, updateRunProgress, upsertPlayerStats } from './db';
import { transformPlayerToRows } from '../schemas/api-football';

interface IngestionOptions {
  leagueId: number;
  season: number;
  maxPages?: number;
  quotaBuffer?: number;
}

export async function runIngestion(options: IngestionOptions): Promise<void> {
  const { leagueId, season, maxPages, quotaBuffer = 10 } = options;

  console.log(`[Ingestion] Starting run: League ${leagueId}, Season ${season}`);
  if (maxPages) {
    console.log(`[Ingestion] Limit set to ${maxPages} page(s) for this run.`);
  }

  const sql = getDbConnection();
  const client = new ApiFootballClient();

  try {
    const run = await getOrCreateRun(sql, leagueId, season);
    console.log(`[Ingestion] Tracking Run #${run.id} | Last completed page: ${run.last_completed_page}`);

    let currentPage = run.last_completed_page + 1;
    let totalPages = run.total_pages || 1;
    let pagesProcessedThisRun = 0;

    while (currentPage <= totalPages) {
      if (maxPages && pagesProcessedThisRun >= maxPages) {
        console.log(`[Ingestion] Reached maximum requested pages limit (${maxPages}). Pausing run.`);
        await updateRunProgress(sql, run.id, currentPage - 1, totalPages, 'partial');
        break;
      }

      console.log(`[Ingestion] Fetching League ${leagueId}, Season ${season}, Page ${currentPage}...`);
      const pageData = await client.fetchPlayersPage(leagueId, season, currentPage);

      totalPages = pageData.paging.total;
      const remainingQuota = client.lastRateLimit.remaining;

      console.log(
        `[Ingestion] Page ${currentPage}/${totalPages} fetched: ${pageData.results} players. (Quota remaining: ${remainingQuota ?? 'unknown'})`
      );

      // Transform API items to DB rows
      const rows = pageData.response.flatMap(transformPlayerToRows);

      // Idempotent upsert into DB
      const result = await upsertPlayerStats(sql, rows);
      console.log(
        `[Ingestion] Upserted ${result.upsertedStats} player stats & ${result.upsertedSnapshots} snapshots for page ${currentPage}.`
      );

      pagesProcessedThisRun++;
      const isComplete = currentPage >= totalPages;
      const nextStatus = isComplete ? 'complete' : 'partial';

      await updateRunProgress(sql, run.id, currentPage, totalPages, nextStatus);

      // Check quota buffer safety
      if (remainingQuota !== null && remainingQuota <= quotaBuffer) {
        console.warn(
          `[Ingestion] Safety alert: Quota remaining (${remainingQuota}) reached minimum buffer (${quotaBuffer}). Stopping safely.`
        );
        break;
      }

      currentPage++;
    }

    console.log(`[Ingestion] Run finished cleanly.`);
  } catch (err) {
    console.error(`[Ingestion] Error during ingestion:`, err);
    throw err;
  } finally {
    await sql.end();
  }
}

// Allow direct CLI invocation: tsx src/ingestion/runner.ts [league] [season] [maxPages]
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const league = parseInt(process.argv[2] || process.env.LEAGUE_ID || '39', 10);
  const season = parseInt(process.argv[3] || process.env.SEASON || '2024', 10);
  const maxPages = process.argv[4] ? parseInt(process.argv[4], 10) : undefined;

  runIngestion({ leagueId: league, season, maxPages })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
