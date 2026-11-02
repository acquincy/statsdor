import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  StrikerPlayerResponseSchema,
  StrikerSquadResponseSchema,
  transformStrikerPlayerToRows,
} from '../src/schemas/striker';

describe('StrikerAPI Schema Validation', () => {
  it('validates player details and seasons fixture successfully', () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/striker-player-sample.json');
    const rawData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const parsed = StrikerPlayerResponseSchema.safeParse(rawData);
    expect(parsed.success).toBe(true);

    if (!parsed.success) {
      console.error(JSON.stringify(parsed.error.issues, null, 2));
      return;
    }

    expect(parsed.data.data.player.name).toBe('Erling Haaland');
    expect(parsed.data.data.seasons.length).toBeGreaterThanOrEqual(5);

    // Verify current 2026 season stats
    const currentSeason = parsed.data.data.seasons.find((s) => s.season === 2026);
    expect(currentSeason).toBeDefined();
    expect(currentSeason?.goals).toBe(9);
    expect(currentSeason?.appearances).toBe(9);
    expect(currentSeason?.xg).toBeGreaterThan(0);

    // Test row transformation
    const rows = transformStrikerPlayerToRows(parsed.data.data);
    expect(rows.length).toBe(parsed.data.data.seasons.length);

    const row2026 = rows.find((r) => r.season === 2026);
    expect(row2026?.name).toBe('Erling Haaland');
    expect(row2026?.team).toBe('MNC');
    expect(row2026?.goals).toBe(9);
    expect(row2026?.goals_per90).toBe(1.01);
  });

  it('validates squad fixture successfully', () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/striker-squad-sample.json');
    const rawData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const parsed = StrikerSquadResponseSchema.safeParse(rawData);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.data?.players?.length).toBe(25);
  });
});
