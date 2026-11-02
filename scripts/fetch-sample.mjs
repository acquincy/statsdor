import fs from 'fs';
import path from 'path';

// Load .env.local manually without external dependencies
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        process.env[key] = value;
      }
    }
  }
}

const apiKey = process.env.API_FOOTBALL_KEY;
const baseUrl = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io';

if (!apiKey) {
  console.error('Missing API_FOOTBALL_KEY in .env.local');
  process.exit(1);
}

const league = process.argv[2] || '39'; // Premier League
const season = process.argv[3] || '2026'; // 2026 season
const page = process.argv[4] || '1';

const url = `${baseUrl}/players?league=${league}&season=${season}&page=${page}`;

console.log(`Fetching 1 sample page: ${url.replace(apiKey, '[REDACTED]')}`);

try {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-apisports-key': apiKey,
    },
  });

  console.log(`HTTP Status: ${response.status} ${response.statusText}`);
  console.log(`Rate limit remaining: ${response.headers.get('x-ratelimit-requests-remaining')}`);
  console.log(`Rate limit limit: ${response.headers.get('x-ratelimit-requests-limit')}`);

  const data = await response.json();

  if (data.errors && Object.keys(data.errors).length > 0) {
    console.error('API errors returned:', JSON.stringify(data.errors, null, 2));
  }

  console.log(`Results count: ${data.results}`);
  console.log(`Paging info:`, data.paging);

  const fixturesDir = path.resolve('fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const outPath = path.join(fixturesDir, `players-sample-${season}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Sample saved successfully to: ${outPath}`);
} catch (err) {
  console.error('Fetch failed:', err);
  process.exit(1);
}
