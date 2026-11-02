# Football Player Stats Tracker: Build Brief

You are helping me build an app that tracks football player season stats using API-Football. I am a self-taught learner, so explain what you do in plain language, and ask before anything destructive.

## Goal

Track cumulative season totals per player (goals, assists, chances created, shots, dribbles, tackles, duels, cards, rating) and show how they change over the season.

## Hard constraints

- API-Football **free plan**: 100 requests/day, plus a per-minute cap (I believe 10/min; verify in the dashboard or response headers).
- The free plan covers the current season. API-Football labels a season by its start year, so 2026/27 is `season=2026`.
- Never burn quota on tests. Use saved sample responses (fixtures) for tests.
- The API key lives only in environment variables or secrets. Never put it in code, logs, or chat.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict mode), Node 22 or Bun |
| Scheduler | GitHub Actions cron (with manual trigger enabled) |
| API client | Typed `fetch` wrapper, throttled, reads `x-ratelimit-requests-remaining` |
| Validation | Zod schemas for API responses |
| Database | Supabase Postgres, schema managed by Supabase CLI migrations |
| DB writes | `postgres` (porsager) driver, bulk upserts over a direct connection |
| Frontend | Next.js, Tailwind, Recharts, deployed on Vercel |
| Tests | Vitest with recorded API responses |

Do not use Supabase Edge Functions as the runner (a full sweep takes about 4 minutes and exceeds their time limits).

## Data source

Endpoint: `GET /players?league={id}&season={year}&page={n}`

- Header: `x-apisports-key`
- Paginated, 20 players per page. Read `paging.total` from the first response.
- Each player has a `statistics` array (one entry per team/league). Players who moved clubs have several entries.
- Key fields: `games.appearences` (sic, check spelling in the docs), `games.minutes`, `goals.total`, `goals.assists`, `passes.key` (chances created), `shots.total`, `shots.on`, `dribbles.success`, `tackles.total`, `duels.won`, `cards.yellow`, `cards.red`, `games.rating`.
- Verify every field name against the current API-Football docs and a real sample response before writing schemas. Do not guess.
- Quirks: many values are `null` (treat as 0), and `rating` is a string (cast to numeric).
- Extra endpoints: `/players/topscorers` and `/players/topassists` return the top 20 in one call each.

## Database schema (starting point)

```sql
create table player_season_stats (
  player_id int, team_id int, league_id int, season int,
  name text, position text, appearances int, minutes int,
  goals int, assists int, key_passes int,
  shots int, shots_on int, dribbles_success int,
  tackles int, duels_won int, yellow int, red int,
  rating numeric, raw jsonb,
  updated_at timestamptz default now(),
  primary key (player_id, team_id, league_id, season)
);

create table player_stats_snapshots (
  like player_season_stats including defaults,
  snapshot_date date,
  primary key (player_id, team_id, league_id, season, snapshot_date)
);

create table ingestion_runs (
  id bigserial primary key,
  league_id int, season int,
  last_completed_page int default 0,
  total_pages int,
  status text,            -- running | partial | complete | failed
  started_at timestamptz default now(),
  finished_at timestamptz
);
```

## Ingestion rules

1. **Throttle:** wait 6 to 7 seconds between calls. Stop cleanly when remaining daily quota is low (keep a buffer of about 10 requests).
2. **Resumable:** record the last completed page in `ingestion_runs`. If quota runs out, the next run continues from the next page instead of restarting.
3. **Idempotent:** upsert on the primary keys, so reruns never create duplicates.
4. **Snapshots:** each run also inserts a dated row into `player_stats_snapshots`. This gives cumulative-over-time charts. Snapshot rows are only meaningful if the job runs consistently.
5. **Raw JSON:** store each player's raw JSON in `raw`, so new stats can be extracted later without refetching.
6. **Validation:** parse every response with Zod. If the shape changes, fail loudly instead of writing bad data.
7. **Quota budget:** one league sweep is roughly 30 to 40 requests. For multiple leagues, rotate one league per day.

## Derived layer (SQL views)

- `player_season_totals`: one row per player per season, summing across teams for players who transferred.
- `player_per90`: stat / minutes * 90, with a minimum-minutes filter (for example 450) for leaderboards.
- `leaderboards`: top players by goals, assists, key passes, and so on. Use a materialized view refreshed after each ingestion if queries get slow.
- Charts read from `player_stats_snapshots` (snapshot_date on the x-axis).

## Frontend

- Leaderboard page with filters (league, position, minimum minutes).
- Player page: season totals, per-90 stats, cumulative goals/assists chart over time.
- Compare-two-players view.
- Generate DB types with `supabase gen types`. The frontend reads views only, using the anon key with Row Level Security.

## Security

- Ingestion uses the Supabase service-role key, stored as a GitHub Actions secret.
- Frontend uses only the anon key.
- Never commit secrets.

## Safety rules for you (the agent)

- Run Supabase MCP against a **dev project** or in read-only mode until I approve the migrations.
- Show me every migration before applying it. No `drop`, `truncate`, or `delete` without my explicit approval.
- First test ingestion on **one page** of results before any full sweep.
- Use saved fixtures for tests, never live API calls.
- Keep quota logic and migrations small and easy for me to review.

## Build order

1. Fetch one real sample response from `/players` and save it as a fixture.
2. Write Zod schemas from that real sample.
3. Create the migrations (tables above) and apply them to the dev project after my approval.
4. Write the ingestion script for one page, then test it against the fixture.
5. Run one live page, check the rows in the database with me.
6. Add the full pagination loop with throttling, resumability, and snapshots.
7. Add the GitHub Actions cron workflow.
8. Create the SQL views.
9. Build the Next.js frontend and deploy to Vercel.

## Questions to ask me before you start

- Which league(s) do I want to track? (This sets the daily quota rotation.)
- Which Supabase project is the dev project?
