import 'dotenv/config';
import { StrikerClient } from './striker-client';
import { upsertStrikerStats } from './striker-db';
import { transformStrikerPlayerToRows } from '../schemas/striker';

interface IngestionOptions {
  league?: string;
  limitPlayers?: number;
  specificPlayerId?: string;
}

export async function runStrikerIngestion(options: IngestionOptions = {}): Promise<void> {
  const { league = 'soccer', limitPlayers, specificPlayerId } = options;

  console.log(`[Striker Ingestion] Starting ingestion for league: ${league}`);
  const client = new StrikerClient();

  let playerIdsToFetch: string[] = [];

  if (specificPlayerId) {
    playerIdsToFetch = [specificPlayerId];
    console.log(`[Striker Ingestion] Fetching specific player: ${specificPlayerId}`);
  } else {
    // Fetch top leaders across goals, assists, and xG to populate the most impactful players first
    console.log(`[Striker Ingestion] Fetching top leaders...`);
    const goalLeaders = await client.getLeaders('goals', undefined, league, limitPlayers || 25);
    const assistLeaders = await client.getLeaders('assists', undefined, league, limitPlayers || 25);

    const ids = new Set<string>();
    for (const leader of goalLeaders.data.leaders || []) {
      if (leader.player_id) ids.add(String(leader.player_id));
    }
    for (const leader of assistLeaders.data.leaders || []) {
      if (leader.player_id) ids.add(String(leader.player_id));
    }

    playerIdsToFetch = Array.from(ids);
    if (limitPlayers && playerIdsToFetch.length > limitPlayers) {
      playerIdsToFetch = playerIdsToFetch.slice(0, limitPlayers);
    }
    console.log(`[Striker Ingestion] Identified ${playerIdsToFetch.length} unique players to ingest.`);
  }

  let totalRowsUpserted = 0;

  for (const playerId of playerIdsToFetch) {
    try {
      console.log(`[Striker Ingestion] Fetching player details for ID: ${playerId}...`);
      const playerData = await client.getPlayer(playerId, league);

      const rows = transformStrikerPlayerToRows(playerData, league);
      const result = await upsertStrikerStats(rows);

      totalRowsUpserted += result.upsertedStats;
      console.log(
        `[Striker Ingestion] Upserted ${rows.length} season rows for ${playerData.player.name} (${playerData.player.team}). Credits remaining: ${client.lastCreditInfo.remaining}`
      );

      // Brief delay between calls to be gentle on the API
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[Striker Ingestion] Failed to ingest player ${playerId}:`, err);
    }
  }

  console.log(
    `[Striker Ingestion] Completed! Total season stat rows upserted: ${totalRowsUpserted}. Credits remaining: ${client.lastCreditInfo.remaining}`
  );
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const specificId = process.argv[2];
  const limit = process.argv[3] ? parseInt(process.argv[3], 10) : 10;

  runStrikerIngestion({
    specificPlayerId: specificId,
    limitPlayers: limit,
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
