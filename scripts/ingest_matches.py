"""
Ingest Match-Centric Data into Supabase
---------------------------------------
Source of truth: top5_player_match_stats_2026_2027.csv (20,513 rows)
Populates:
  1. `players` table (player_id, name, latest team, league, main position, jersey)
  2. `player_matches` table (primary key: game_id + player_id, all match stats)
  3. Derives `player_team_season_stats` and `player_season_totals` views
Idempotent upsert via PostgREST resolution=merge-duplicates.
"""

import math
import os
import sys
import time
from pathlib import Path
import numpy as np
import pandas as pd
import requests

# Supabase configuration
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "https://nqqjwwyvulbefuxlxwob.supabase.co")
SUPABASE_ANON_KEY = os.getenv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xcWp3d3l2dWxiZWZ1eGx4d29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NTM5NDgsImV4cCI6MjEwOTEyOTk0OH0.LZb22vH4mRDTMnprl05shwyrbGz3CpTfxPjx0r4ekFU",
)

MATCH_CSV_PATH = Path(__file__).resolve().parent.parent / "top5_player_match_stats_2026_2027.csv"

HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


def categorize_position(pos: str) -> str:
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


def upload_batch(endpoint: str, batch: list, batch_idx: int, total_batches: int, max_retries: int = 3):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    for attempt in range(max_retries):
        try:
            res = requests.post(url, headers=HEADERS, json=batch, timeout=30)
            if res.status_code in (200, 201, 204):
                return True
            print(f"  [Attempt {attempt+1}] Batch {batch_idx}/{total_batches} error: {res.status_code} - {res.text[:120]}")
        except Exception as e:
            print(f"  [Attempt {attempt+1}] Batch {batch_idx}/{total_batches} exception: {e}")
        time.sleep(1 + attempt)
    raise RuntimeError(f"Failed to upload batch {batch_idx}/{total_batches} to {endpoint}")


def sanitize_val(val, val_type=int, default=0):
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


def main():
    start_time = time.time()
    print("==========================================================")
    print("StatsDor Match-Centric Supabase Ingestion")
    print(f"Target Project: {SUPABASE_URL}")
    print(f"Source CSV: {MATCH_CSV_PATH}")
    print("==========================================================")

    if not MATCH_CSV_PATH.exists():
        print(f"Error: {MATCH_CSV_PATH} not found!")
        sys.exit(1)

    print("\n1. Loading and parsing match CSV...")
    df = pd.read_csv(MATCH_CSV_PATH)
    total_rows = len(df)
    print(f"Loaded {total_rows:,} match player rows across 5 European leagues.")

    # Sort chronologically so latest appearances come last
    df["date_dt"] = pd.to_datetime(df["date"])
    df = df.sort_values(by=["date_dt", "game_id"])

    # 2. Derive Players Registry
    print("\n2. Computing player registry (main position, latest team, league)...")
    non_sub = df[(df["position"].notna()) & (df["position"] != "Substitute")]

    # Most frequent non-Substitute position per player
    def get_mode_pos(series):
        modes = series.mode()
        return modes.iloc[-1] if not modes.empty else "Substitute"

    main_pos_map = non_sub.groupby("player_id")["position"].agg(get_mode_pos).to_dict()

    # Latest record per player
    latest_player_df = df.groupby("player_id").last().reset_index()

    player_records = []
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

    print(f"Extracted {len(player_records):,} unique players.")

    # 3. Upsert Players into Supabase
    print("\n3. Upserting players into `players` table...")
    batch_size = 500
    num_player_batches = math.ceil(len(player_records) / batch_size)
    for i in range(num_player_batches):
        batch = player_records[i * batch_size : (i + 1) * batch_size]
        upload_batch("players", batch, i + 1, num_player_batches)
        if (i + 1) % 2 == 0 or (i + 1) == num_player_batches:
            print(f"  Uploaded players batch {i + 1}/{num_player_batches} ({(i + 1) * batch_size if (i + 1) < num_player_batches else len(player_records)} / {len(player_records)})")

    # 4. Prepare and Upsert Player Matches
    print("\n4. Preparing match player rows...")
    # Derive matchweek per game based on team round number
    distinct_games = df[["league", "team", "game_id", "date"]].drop_duplicates().copy()
    distinct_games = distinct_games.sort_values(by=["date", "game_id"])
    distinct_games["team_match_no"] = distinct_games.groupby(["league", "team"]).cumcount() + 1
    game_mw_map = distinct_games.groupby("game_id")["team_match_no"].max().to_dict()

    match_records = []
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
            "season": 2026,  # 2026/2027 season mapped to standard 2026
            "matchweek": int(game_mw_map.get(gid, 1)),
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

    print(f"\n5. Upserting {len(match_records):,} match records into `player_matches` table...")
    num_match_batches = math.ceil(len(match_records) / batch_size)
    for i in range(num_match_batches):
        batch = match_records[i * batch_size : (i + 1) * batch_size]
        upload_batch("player_matches", batch, i + 1, num_match_batches)
        if (i + 1) % 5 == 0 or (i + 1) == num_match_batches:
            print(f"  Uploaded match batch {i + 1}/{num_match_batches} ({(i + 1) * batch_size if (i + 1) < num_match_batches else len(match_records):,} / {len(match_records):,})")

    elapsed = round(time.time() - start_time, 2)
    print("\n==========================================================")
    print(f"Ingestion Completed Successfully in {elapsed}s!")
    print(f"Players Upserted: {len(player_records):,}")
    print(f"Player Matches Upserted: {len(match_records):,}")
    print("==========================================================")


if __name__ == "__main__":
    main()
