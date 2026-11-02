import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ApiPlayersResponseSchema, transformPlayerToRows } from '../src/schemas/api-football';

describe('API Football Schema Validation', () => {
  it('should validate the real Premier League 2024 fixture without errors', () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/players-sample-2024.json');
    const rawData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const parsed = ApiPlayersResponseSchema.safeParse(rawData);
    expect(parsed.success).toBe(true);

    if (!parsed.success) return;

    expect(parsed.data.results).toBe(20);
    expect(parsed.data.paging.total).toBe(57);
    expect(parsed.data.response.length).toBe(20);

    // Test row transformation
    const allRows = parsed.data.response.flatMap(transformPlayerToRows);
    expect(allRows.length).toBeGreaterThanOrEqual(20);

    const firstRow = allRows[0];
    expect(firstRow.player_id).toBeDefined();
    expect(firstRow.league_id).toBe(39);
    expect(firstRow.season).toBe(2024);
    expect(typeof firstRow.name).toBe('string');
    expect(typeof firstRow.appearances).toBe('number');
    expect(typeof firstRow.minutes).toBe('number');
    expect(typeof firstRow.goals).toBe('number');
    expect(typeof firstRow.assists).toBe('number');
  });
});
