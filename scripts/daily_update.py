"""
Daily Football Match Stats Ingestion Pipeline
=============================================
Fetches recent matches across the Top 5 European Leagues using soccerdata's ESPN reader,
parses player match stats, creates daily raw Parquet/CSV snapshots in storage,
performs idempotent upserts into Supabase on (game_id, player_id),
runs post-ingestion sanity checks, and logs the run to `ingestion_runs`.
"""

import argparse
import concurrent.futures
import gzip
import json
import math
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd
import requests
import soccerdata as sd
import soccerdata.espn as sd_espn
from soccerdata._config import TEAMNAME_REPLACEMENTS

# Primary and fallback ESPN endpoints
PRIMARY_ESPN_API = "https://site.api.espn.com/apis/site/v2/sports/soccer"
FALLBACK_ESPN_API = "https://site.web.api.espn.com/apis/site/v2/sports/soccer"
sd_espn.ESPN_API = PRIMARY_ESPN_API

# Top 5 European League exact identifiers expected by soccerdata
TOP_5_LEAGUES = {
    "ENG-Premier League": "eng.1",
    "ESP-La Liga": "esp.1",
    "GER-Bundesliga": "ger.1",
    "FRA-Ligue 1": "fra.1",
    "ITA-Serie A": "ita.1",
}
SEASON_LABEL = "2026-2027"
SEASON_YEAR = 2026
DEFAULT_LOOKBACK_DAYS = 3


def categorize_position(pos: Optional[str]) -> str:
    """Categorize a player position into standard high-level roles."""
    if not pos or pd.isna(pos):
        return "Other"
    p = str(pos).lower()
    if "goalkeeper" in p:
        return "Goalkeeper"
    if any(k in p for k in ["defender", "back", "sweeper"]):
        return "Defender"
    if "midfield" in p:
        return "Midfielder"
    if any(k in p for k in ["forward", "striker", "winger"]):
        return "Forward"
    if "substitute" in p:
        return "Substitute"
    return "Other"


def sanitize_val(val: Any, val_type=int, default=0):
    """Safely cast numbers/booleans to avoid NaN or type errors."""
    if pd.isna(val) or val is None:
        return default
    try:
        if val_type == int:
            return int(float(val))
        elif val_type == float:
            return float(val)
        elif val_type == bool:
            return bool(val)
        return val
    except (ValueError, TypeError):
        return default


class SupabaseClient:
    """Lightweight Supabase PostgREST & Storage client."""

    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key
        self.session = requests.Session()
        self.session.headers.update({
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
        })

    def query_exact_count(self, table: str, params: Optional[Dict[str, str]] = None) -> int:
        """Fetch exact row count for a table or filter via Content-Range header."""
        headers = {"Prefer": "count=exact"}
        req_params = {"limit": "1"}
        if params:
            req_params.update(params)
        res = self.session.get(f"{self.url}/rest/v1/{table}", headers=headers, params=req_params, timeout=15)
        if res.status_code in (200, 206):
            cr = res.headers.get("content-range", "")
            if "/" in cr:
                total_str = cr.split("/")[-1]
                if total_str.isdigit():
                    return int(total_str)
        return 0

    def get_baseline_counts(self) -> Tuple[Dict[str, int], int, Set[str]]:
        """
        Query baseline league row counts, total games, and set of existing game IDs.
        Uses fast views or falls back to direct queries.
        """
        league_counts: Dict[str, int] = {}
        total_games = 0
        existing_games: Set[str] = set()

        # 1. League counts view
        try:
            res = self.session.get(f"{self.url}/rest/v1/league_match_counts", timeout=10)
            if res.status_code == 200:
                for row in res.json():
                    league_counts[row["league"]] = int(row.get("row_count", 0))
        except Exception:
            pass

        # Fallback to per-league exact count if view unavailable
        if not league_counts:
            for league in TOP_5_LEAGUES.keys():
                league_counts[league] = self.query_exact_count("player_matches", {"league": f"eq.{league}"})

        # 2. Total distinct matches view
        try:
            res = self.session.get(f"{self.url}/rest/v1/match_summary_counts", timeout=10)
            if res.status_code == 200 and res.json():
                total_games = int(res.json()[0].get("total_games", 0))
        except Exception:
            total_games = 0

        # 3. Existing distinct game IDs
        try:
            offset = 0
            limit = 5000
            while True:
                res = self.session.get(
                    f"{self.url}/rest/v1/player_matches",
                    params={"select": "game_id", "order": "game_id.asc", "limit": str(limit), "offset": str(offset)},
                    timeout=20,
                )
                if res.status_code != 200 or not res.json():
                    break
                batch = res.json()
                for r in batch:
                    if r.get("game_id"):
                        existing_games.add(str(r["game_id"]))
                if len(batch) < limit:
                    break
                offset += limit
        except Exception as e:
            print(f"  [Warning] Note on fetching existing game_ids: {e}")

        if total_games == 0 and existing_games:
            total_games = len(existing_games)

        return league_counts, total_games, existing_games

    def log_run_start(self, season: int = SEASON_YEAR) -> int:
        """Create a new run entry in `ingestion_runs` table."""
        payload = {
            "league": "Top 5 European Leagues",
            "season": season,
            "status": "running",
            "matches_fetched": 0,
            "rows_upserted": 0,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        headers = {"Prefer": "return=representation", "Content-Type": "application/json"}
        try:
            res = self.session.post(f"{self.url}/rest/v1/ingestion_runs", headers=headers, json=[payload], timeout=15)
            if res.status_code in (200, 201) and res.json():
                return int(res.json()[0]["id"])
        except Exception as e:
            print(f"  [Warning] Could not log run start to ingestion_runs: {e}")
        return -1

    def log_run_finish(self, run_id: int, status: str, matches_fetched: int, rows_upserted: int, error_msg: Optional[str] = None):
        """Update `ingestion_runs` record upon completion or failure."""
        if run_id <= 0:
            return
        payload: Dict[str, Any] = {
            "status": status,
            "matches_fetched": matches_fetched,
            "rows_upserted": rows_upserted,
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
        if error_msg:
            payload["error_message"] = str(error_msg)[:500]
        headers = {"Content-Type": "application/json"}
        try:
            self.session.patch(
                f"{self.url}/rest/v1/ingestion_runs",
                headers=headers,
                params={"id": f"eq.{run_id}"},
                json=payload,
                timeout=15,
            )
        except Exception as e:
            print(f"  [Warning] Could not update ingestion_runs status: {e}")

    def upsert_batch(self, table: str, batch: List[Dict[str, Any]], on_conflict: Optional[str] = None, max_retries: int = 3):
        """Perform idempotent upsert using PostgREST resolution=merge-duplicates."""
        url = f"{self.url}/rest/v1/{table}"
        params = {}
        if on_conflict:
            params["on_conflict"] = on_conflict
        headers = {
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        }
        last_error = None
        for attempt in range(max_retries):
            try:
                res = self.session.post(url, headers=headers, params=params, json=batch, timeout=30)
                if res.status_code in (200, 201, 204):
                    return True
                last_error = f"HTTP {res.status_code}: {res.text[:140]}"
                print(f"  [Attempt {attempt+1}] Upsert error to {table}: {last_error}")
            except Exception as e:
                last_error = str(e)
                print(f"  [Attempt {attempt+1}] Upsert exception to {table}: {last_error}")
            time.sleep(1 + attempt * 2)
        raise RuntimeError(f"Failed to upsert batch of {len(batch)} rows into `{table}`: {last_error}")

    def upload_storage_file(self, bucket: str, destination_path: str, file_path: Path, content_type: str = "application/octet-stream") -> bool:
        """Upload raw snapshot file to Supabase Storage."""
        url = f"{self.url}/storage/v1/object/{bucket}/{destination_path}"
        headers = {
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        try:
            with open(file_path, "rb") as f:
                res = self.session.post(url, headers=headers, data=f, timeout=60)
            if res.status_code in (200, 201):
                print(f"  [Storage] Uploaded {file_path.name} to {bucket}/{destination_path}")
                return True
            else:
                print(f"  [Storage] Notice: Upload returned {res.status_code} ({res.text[:100]}). Local file preserved.")
        except Exception as e:
            print(f"  [Storage] Notice: Storage upload skipped ({e}). Local snapshot preserved.")
        return False


def discover_recent_matches(
    espn: sd.ESPN,
    lookback_days: int,
    existing_game_ids: Set[str],
    full_season: bool = False
) -> List[Dict[str, Any]]:
    """
    Identifies matches to fetch:
    1. Scoreboards for the past N days across the 5 leagues.
    2. Excludes older matches unless `full_season` is requested.
    """
    matches_to_fetch: Dict[str, Dict[str, Any]] = {}
    today = datetime.now(timezone.utc).date()
    dates_to_check = [today - timedelta(days=i) for i in range(lookback_days)]
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    })

    print(f"\nChecking scoreboards for past {lookback_days} days ({dates_to_check[-1]} to {dates_to_check[0]})...")

    for league_name, league_code in TOP_5_LEAGUES.items():
        for d in dates_to_check:
            date_str = d.strftime("%Y%m%d")
            file_path = espn.data_dir / f"Schedule_{league_code}_{date_str}.json"

            data = None
            # Check cached schedule file if older than today
            if file_path.exists() and d < today and file_path.stat().st_size > 200:
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                except Exception:
                    data = None

            if not data:
                for api_base in [PRIMARY_ESPN_API, FALLBACK_ESPN_API]:
                    url = f"{api_base}/{league_code}/scoreboard?dates={date_str}"
                    for attempt in range(3):
                        try:
                            resp = session.get(url, timeout=12)
                            if resp.status_code == 200:
                                data = resp.json()
                                with open(file_path, "w", encoding="utf-8") as f:
                                    json.dump(data, f)
                                break
                            elif resp.status_code in (403, 429):
                                print(f"  [ESPN Rate Limit] HTTP {resp.status_code} for {league_code} on {date_str} (attempt {attempt+1})", file=sys.stderr)
                                time.sleep(2 * (attempt + 1))
                        except Exception as e:
                            time.sleep(1)
                    if data:
                        break

            if not data:
                continue

            events = data.get("events", [])
            for e in events:
                gid = str(e.get("id"))
                status_type = e.get("status", {}).get("type", {})
                state = status_type.get("state", "")
                completed = status_type.get("completed", False)
                comps = e.get("competitions", [{}])[0]
                competitors = comps.get("competitors", [{}, {}])
                home_team = competitors[0].get("team", {}).get("name", "Home") if len(competitors) > 0 else "Home"
                away_team = competitors[1].get("team", {}).get("name", "Away") if len(competitors) > 1 else "Away"
                game_title = f"{home_team} vs {away_team}"

                # Only include completed or in-progress matches
                if completed or state in ("post", "in"):
                    matches_to_fetch[gid] = {
                        "game_id": gid,
                        "league": league_name,
                        "league_id": league_code,
                        "season": SEASON_LABEL,
                        "date": e.get("date", str(d))[:10],
                        "game": game_title,
                        "is_recent": True,
                    }

    # If full season explicitly requested, load full schedule cache
    if full_season:
        print("Cross-referencing with soccerdata full season schedule...")
        try:
            sched = espn.read_schedule(force_cache=True).reset_index()
            now_ts = pd.Timestamp.now(tz="UTC")
            played = sched[sched["date"] <= now_ts].copy()

            for _, row in played.iterrows():
                gid = str(row["game_id"])
                if gid not in matches_to_fetch:
                    matches_to_fetch[gid] = {
                        "game_id": gid,
                        "league": str(row["league"]),
                        "league_id": TOP_5_LEAGUES.get(str(row["league"]), "eng.1"),
                        "season": str(row["season"]),
                        "date": row["date"].strftime("%Y-%m-%d"),
                        "game": str(row["game"]),
                        "is_recent": False,
                    }
        except Exception as e:
            print(f"  [Notice] Full season schedule note: {e}")

    result = list(matches_to_fetch.values())
    print(f"Identified {len(result)} match(es) in the last {lookback_days} days.")
    return result


def fetch_match_summaries(
    espn: sd.ESPN,
    matches: List[Dict[str, Any]],
    max_workers: int = 6
) -> Dict[str, Dict[str, Any]]:
    """Downloads/reads match summary JSONs using soccerdata cache directory."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    })
    summaries: Dict[str, Dict[str, Any]] = {}
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def fetch_one(m: Dict[str, Any]) -> Tuple[str, Optional[Dict[str, Any]]]:
        gid = m["game_id"]
        lid = m["league_id"]
        m_date = m["date"]
        file_path = espn.data_dir / f"Summary_{gid}.json"

        # If played before today and cache exists, reuse persisted cache
        if file_path.exists() and m_date < today_str and file_path.stat().st_size > 500:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return gid, json.load(f)
            except Exception:
                pass

        # Otherwise fetch from ESPN API
        for api_base in [PRIMARY_ESPN_API, FALLBACK_ESPN_API]:
            url = f"{api_base}/{lid}/summary?event={gid}"
            for attempt in range(3):
                try:
                    resp = session.get(url, timeout=15)
                    if resp.status_code == 200:
                        data = resp.json()
                        with open(file_path, "w", encoding="utf-8") as f:
                            json.dump(data, f)
                        return gid, data
                    elif resp.status_code in (403, 429):
                        print(f"  [ESPN Rate Limit / Block] HTTP {resp.status_code} for game {gid}", file=sys.stderr)
                        time.sleep(2 * (attempt + 1))
                except Exception:
                    time.sleep(1)
        return gid, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_one, m): m["game_id"] for m in matches}
        for f in concurrent.futures.as_completed(futures):
            gid, data = f.result()
            if data:
                summaries[gid] = data

    return summaries


def parse_match_data(
    matches: List[Dict[str, Any]],
    summaries: Dict[str, Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], pd.DataFrame]:
    """Parses player entries and match log records matching the player_matches table."""
    records: List[Dict[str, Any]] = []

    for match in matches:
        gid = match["game_id"]
        data = summaries.get(gid)
        if not data:
            continue

        rosters = data.get("rosters", [])
        for i, team_roster in enumerate(rosters):
            if "roster" not in team_roster:
                continue
            team_name = team_roster.get("team", {}).get("displayName", f"Team {i+1}")
            for p in team_roster["roster"]:
                athlete = p.get("athlete", {})
                player_name = athlete.get("displayName")
                player_id = str(athlete.get("id")) if athlete.get("id") else None

                # Discard invalid player entries without ID or name
                if not player_name or not player_id:
                    continue

                player_entry = {
                    "league": match["league"],
                    "season": SEASON_YEAR,
                    "date": match["date"],
                    "game": match["game"],
                    "game_id": gid,
                    "team": team_name,
                    "is_home": (i == 0),
                    "player": player_name,
                    "player_id": player_id,
                    "position": p.get("position", {}).get("name") if "position" in p else None,
                    "starter": p.get("starter", False),
                    "jersey": p.get("jersey"),
                }

                if "stats" in p:
                    for stat in p["stats"]:
                        player_entry[stat["name"]] = stat.get("value", 0.0)

                records.append(player_entry)

    if not records:
        return [], [], pd.DataFrame()

    df = pd.DataFrame(records).replace({"team": TEAMNAME_REPLACEMENTS})
    df["date_dt"] = pd.to_datetime(df["date"])
    df = df.sort_values(by=["date_dt", "game_id"])

    # 1. Derive player registry
    non_sub = df[(df["position"].notna()) & (df["position"] != "Substitute")]

    def get_mode_pos(series):
        modes = series.mode()
        return modes.iloc[-1] if not modes.empty else "Substitute"

    main_pos_map = non_sub.groupby("player_id")["position"].agg(get_mode_pos).to_dict()
    latest_player_df = df.groupby("player_id").last().reset_index()

    player_records: List[Dict[str, Any]] = []
    for _, row in latest_player_df.iterrows():
        pid = str(row["player_id"])
        m_pos = main_pos_map.get(row["player_id"], "Substitute")
        cat = categorize_position(m_pos)
        jersey_val = sanitize_val(row.get("jersey"), int, default=None)
        if jersey_val is not None and jersey_val <= 0:
            jersey_val = None

        player_records.append({
            "player_id": pid,
            "name": str(row["player"]),
            "team": str(row["team"]),
            "league": str(row["league"]),
            "position": m_pos,
            "position_category": cat,
            "jersey": jersey_val,
        })

    # 2. Derive player match logs matching player_matches table columns
    match_records: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        pid = str(row["player_id"])
        gid = str(row["game_id"])
        jersey_val = sanitize_val(row.get("jersey"), int, default=None)
        if jersey_val is not None and jersey_val <= 0:
            jersey_val = None

        match_records.append({
            "game_id": gid,
            "player_id": pid,
            "league": str(row["league"]),
            "season": SEASON_YEAR,
            "date": str(row["date"]),
            "game": str(row["game"]),
            "team": str(row["team"]),
            "is_home": bool(row["is_home"]),
            "player": str(row["player"]),
            "position": str(row["position"]) if pd.notna(row["position"]) else None,
            "starter": bool(row["starter"]),
            "jersey": jersey_val,
            "appearances": sanitize_val(row.get("appearances")),
            "sub_ins": sanitize_val(row.get("subIns")),
            "total_goals": sanitize_val(row.get("totalGoals")),
            "goal_assists": sanitize_val(row.get("goalAssists")),
            "total_shots": sanitize_val(row.get("totalShots")),
            "shots_on_target": sanitize_val(row.get("shotsOnTarget")),
            "fouls_committed": sanitize_val(row.get("foulsCommitted")),
            "fouls_suffered": sanitize_val(row.get("foulsSuffered")),
            "yellow_cards": sanitize_val(row.get("yellowCards")),
            "red_cards": sanitize_val(row.get("redCards")),
            "offsides": sanitize_val(row.get("offsides")),
            "own_goals": sanitize_val(row.get("ownGoals")),
            "saves": sanitize_val(row.get("saves")),
            "goals_conceded": sanitize_val(row.get("goalsConceded")),
            "shots_faced": sanitize_val(row.get("shotsFaced")),
        })

    return player_records, match_records, df


def save_and_upload_snapshots(
    df: pd.DataFrame,
    summaries: Dict[str, Dict[str, Any]],
    supabase: SupabaseClient,
    snapshots_dir: Path,
    skip_storage: bool = False
) -> Tuple[Path, Path]:
    """Saves daily Parquet and CSV snapshot, plus raw JSON archive, and uploads to storage."""
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    parquet_path = snapshots_dir / f"pull_{timestamp_str}.parquet"
    csv_path = snapshots_dir / f"pull_{timestamp_str}.csv"
    json_path = snapshots_dir / f"raw_summaries_{timestamp_str}.json.gz"

    df.to_parquet(parquet_path, index=False)
    df.to_csv(csv_path, index=False)
    with gzip.open(json_path, "wt", encoding="utf-8") as f:
        json.dump(summaries, f)

    print(f"\n[Snapshot Saved] Parquet: {parquet_path.name} ({parquet_path.stat().st_size:,} bytes)")
    print(f"[Snapshot Saved] CSV: {csv_path.name} ({csv_path.stat().st_size:,} bytes)")
    print(f"[Snapshot Saved] Raw JSON: {json_path.name} ({json_path.stat().st_size:,} bytes)")

    if not skip_storage:
        year_str = date_str[:4]
        month_str = date_str[5:7]
        storage_dest_parquet = f"{year_str}/{month_str}/{parquet_path.name}"
        storage_dest_csv = f"{year_str}/{month_str}/{csv_path.name}"

        supabase.upload_storage_file("raw-snapshots", storage_dest_parquet, parquet_path, "application/vnd.apache.parquet")
        supabase.upload_storage_file("raw-snapshots", storage_dest_csv, csv_path, "text/csv")

    return parquet_path, csv_path


def run_sanity_checks(
    supabase: SupabaseClient,
    baseline_league_counts: Dict[str, int],
    baseline_games_count: int,
    records_to_upsert: List[Dict[str, Any]]
):
    """
    Validates:
    1. In-memory records have NO null or empty player_id or game_id.
    2. Supabase DB contains NO null player_id or game_id.
    3. Row count per league didn't drop.
    4. Match count only increases.
    """
    print("\n=== Running Post-Ingestion Sanity Checks ===")

    # Check 1: In-memory integrity
    for r in records_to_upsert:
        pid = r.get("player_id")
        gid = r.get("game_id")
        if not pid or pid == "None" or pd.isna(pid):
            raise AssertionError(f"Sanity Check Failed: Null or empty player_id found in record: {r}")
        if not gid or gid == "None" or pd.isna(gid):
            raise AssertionError(f"Sanity Check Failed: Null or empty game_id found in record: {r}")

    print("  [Pass] In-memory integrity: 0 null player_id or game_id.")

    # Check 2: Database null check
    null_rows = supabase.query_exact_count("player_matches", {"or": "(player_id.is.null,game_id.is.null)"})
    if null_rows > 0:
        raise AssertionError(f"Sanity Check Failed: {null_rows} rows found in database with null player_id or game_id!")
    print(f"  [Pass] Database null check: 0 null player_id or game_id in `player_matches`.")

    # Check 3 & 4: League counts and match count
    post_league_counts, post_games_count, _ = supabase.get_baseline_counts()

    print("\nLeague Row Count Comparison:")
    for league, pre_count in baseline_league_counts.items():
        post_count = post_league_counts.get(league, 0)
        diff = post_count - pre_count
        print(f"  {league:<22}: {pre_count:>6,} -> {post_count:>6,} ({'+' if diff >= 0 else ''}{diff})")
        if post_count < pre_count:
            raise AssertionError(
                f"Sanity Check Failed: Row count for '{league}' dropped from {pre_count} to {post_count}!"
            )

    print(f"\nMatch Count Comparison:")
    print(f"  Total Games: {baseline_games_count} -> {post_games_count} ({'+' if post_games_count >= baseline_games_count else ''}{post_games_count - baseline_games_count})")
    if post_games_count < baseline_games_count:
        raise AssertionError(
            f"Sanity Check Failed: Total games count decreased from {baseline_games_count} to {post_games_count}!"
        )

    print("\n[All Sanity Checks Passed Successfully!]")


def main():
    parser = argparse.ArgumentParser(description="Daily Football Stats Ingestion Pipeline")
    parser.add_argument("--days", type=int, default=DEFAULT_LOOKBACK_DAYS, help="Lookback window in days (default: 3)")
    parser.add_argument("--all", action="store_true", help="Fetch and update all played matches for full season")
    parser.add_argument("--data-dir", type=str, default=None, help="Soccerdata cache directory")
    parser.add_argument("--dry-run", action="store_true", help="Scrape without writing to Supabase")
    parser.add_argument("--skip-storage", action="store_true", help="Skip Supabase Storage upload")
    args = parser.parse_args()

    start_time = time.time()
    print("=" * 65)
    print("StatsDor Daily Match Ingestion Pipeline")
    print(f"Season: {SEASON_LABEL} (Year {SEASON_YEAR})")
    print(f"Mode: {'Full Season' if args.all else f'Recent Matches (Lookback: {args.days} days)'}")
    print("=" * 65)

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )

    if not supabase_url or not supabase_key:
        print("\n[FATAL ERROR] Supabase configuration missing! Please ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are set.", file=sys.stderr)
        sys.exit(1)

    supabase = SupabaseClient(supabase_url, supabase_key)

    # Initialize soccerdata ESPN reader with persisted cache directory
    custom_dir = args.data_dir or os.getenv("SOCCERDATA_DIR")
    cache_dir = Path(custom_dir) if custom_dir else Path.home() / "soccerdata"
    espn_cache_dir = cache_dir / "data" / "ESPN"
    espn_cache_dir.mkdir(parents=True, exist_ok=True)

    print(f"Soccerdata cache directory: {espn_cache_dir}")
    espn = sd.ESPN(leagues=list(TOP_5_LEAGUES.keys()), seasons=SEASON_LABEL, data_dir=cache_dir)

    # 1. Baseline metrics & Run logging
    print("\n1. Fetching baseline counts from Supabase...")
    baseline_league_counts, baseline_games_count, existing_game_ids = supabase.get_baseline_counts()
    print(f"  Current DB state: {baseline_games_count} matches, {sum(baseline_league_counts.values()):,} total rows.")

    run_id = -1
    if not args.dry_run:
        run_id = supabase.log_run_start(season=SEASON_YEAR)
        print(f"  Ingestion run logged with ID: {run_id}")

    try:
        # 2. Discover target matches (last 3 days)
        target_matches = discover_recent_matches(
            espn=espn,
            lookback_days=args.days,
            existing_game_ids=existing_game_ids,
            full_season=args.all,
        )

        if not target_matches:
            err_msg = f"ESPN fetch returned 0 match records across the Top 5 leagues for the last {args.days} days."
            print(f"\n[FATAL ERROR] {err_msg}", file=sys.stderr)
            if not args.dry_run and run_id > 0:
                supabase.log_run_finish(run_id, status="failed", matches_fetched=0, rows_upserted=0, error_msg=err_msg)
            sys.exit(1)

        # 3. Fetch match summaries
        print(f"\n2. Fetching summaries for {len(target_matches)} matches...")
        t0 = time.time()
        summaries = fetch_match_summaries(espn, target_matches)
        print(f"  Fetched {len(summaries)} match summaries in {round(time.time() - t0, 1)}s.")

        if not summaries:
            err_msg = "Failed to retrieve any ESPN match summaries."
            print(f"\n[FATAL ERROR] {err_msg}", file=sys.stderr)
            if not args.dry_run and run_id > 0:
                supabase.log_run_finish(run_id, status="failed", matches_fetched=0, rows_upserted=0, error_msg=err_msg)
            sys.exit(1)

        # 4. Parse player and match stats
        print("\n3. Parsing player match logs and team totals...")
        player_records, match_records, df_parsed = parse_match_data(target_matches, summaries)
        print(f"  Parsed {len(player_records):,} unique players, {len(match_records):,} player-match records.")

        if not match_records:
            err_msg = "Parsing produced 0 player-match records from retrieved match summaries."
            print(f"\n[FATAL ERROR] {err_msg}", file=sys.stderr)
            if not args.dry_run and run_id > 0:
                supabase.log_run_finish(run_id, status="failed", matches_fetched=len(target_matches), rows_upserted=0, error_msg=err_msg)
            sys.exit(1)

        # 5. Save local and remote snapshots
        snapshots_dir = Path(__file__).resolve().parent.parent / "data" / "snapshots"
        save_and_upload_snapshots(
            df=df_parsed,
            summaries=summaries,
            supabase=supabase,
            snapshots_dir=snapshots_dir,
            skip_storage=args.skip_storage or args.dry_run
        )

        # 6. Upsert into Supabase on (game_id, player_id)
        if not args.dry_run:
            print(f"\n4. Upserting {len(player_records):,} players into `players` (on conflict: player_id)...")
            batch_size = 500
            p_batches = math.ceil(len(player_records) / batch_size)
            for i in range(p_batches):
                b = player_records[i * batch_size : (i + 1) * batch_size]
                supabase.upsert_batch("players", b, on_conflict="player_id")

            print(f"\n5. Upserting {len(match_records):,} player match records into `player_matches` (on conflict: game_id,player_id)...")
            m_batches = math.ceil(len(match_records) / batch_size)
            for i in range(m_batches):
                b = match_records[i * batch_size : (i + 1) * batch_size]
                supabase.upsert_batch("player_matches", b, on_conflict="game_id,player_id")

            # 7. Post-run sanity checks
            run_sanity_checks(
                supabase=supabase,
                baseline_league_counts=baseline_league_counts,
                baseline_games_count=baseline_games_count,
                records_to_upsert=match_records,
            )

            # 8. Log run completion
            supabase.log_run_finish(
                run_id=run_id,
                status="complete",
                matches_fetched=len(target_matches),
                rows_upserted=len(match_records),
            )
        else:
            print("\n[Dry Run] Skipping Supabase write and sanity checks.")

        elapsed = round(time.time() - start_time, 2)
        print("\n" + "=" * 65)
        print(f"Pipeline finished successfully in {elapsed}s!")
        print(f"Matches processed: {len(target_matches)}")
        print(f"Player match rows: {len(match_records):,}")
        print("=" * 65)

    except Exception as e:
        print(f"\n[FATAL ERROR] Ingestion failed: {e}", file=sys.stderr)
        if not args.dry_run and run_id > 0:
            supabase.log_run_finish(
                run_id=run_id,
                status="failed",
                matches_fetched=len(target_matches) if "target_matches" in locals() else 0,
                rows_upserted=0,
                error_msg=str(e),
            )
        sys.exit(1)


if __name__ == "__main__":
    main()
