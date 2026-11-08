"""
Scrape and aggregate player statistics across the Top 5 European Leagues
(England, Spain, Germany, France, Italy) for the 2026/2027 season using soccerdata.
"""

import concurrent.futures
import json
import os
from pathlib import Path
import time
import pandas as pd
import requests
import soccerdata as sd
import soccerdata.espn as sd_espn
from soccerdata._config import TEAMNAME_REPLACEMENTS

# Use the reliable HTTPS endpoint with static IP resolution
sd_espn.ESPN_API = "https://site.web.api.espn.com/apis/site/v2/sports/soccer"

TOP_5_LEAGUES = [
    "ENG-Premier League",
    "ESP-La Liga",
    "GER-Bundesliga",
    "FRA-Ligue 1",
    "ITA-Serie A",
]
SEASON = "2026-2027"

DATA_DIR = Path(os.path.expanduser("~")) / "soccerdata" / "data" / "ESPN"
DATA_DIR.mkdir(parents=True, exist_ok=True)

URL_MASK = "https://site.web.api.espn.com/apis/site/v2/sports/soccer/{}/summary?event={}"
FILE_MASK = "Summary_{}.json"


def download_match_summary(session, league_id, game_id):
    """Download summary JSON for a match and save to soccerdata cache."""
    filepath = DATA_DIR / FILE_MASK.format(game_id)
    if filepath.exists() and filepath.stat().st_size > 500:
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return game_id, json.load(f)
        except Exception:
            pass

    url = URL_MASK.format(league_id, game_id)
    for _ in range(3):
        try:
            resp = session.get(url, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(data, f)
                return game_id, data
        except Exception:
            time.sleep(1)
    return game_id, None


def main():
    print(f"=== Initializing soccerdata for Top 5 Leagues: {TOP_5_LEAGUES} ({SEASON}) ===")
    espn = sd.ESPN(leagues=TOP_5_LEAGUES, seasons=SEASON)

    print("Loading schedules from soccerdata cache...")
    sched = espn.read_schedule().reset_index()

    # Filter to matches played up to today
    now = pd.Timestamp.now(tz="UTC")
    played = sched[sched["date"] <= now].copy()
    print(f"\nTotal played matches across Top 5 European Leagues: {len(played)}")
    print(played["league"].value_counts().to_string())

    # Download summary JSONs in parallel
    print("\nFetching matchday player summary data...")
    t0 = time.time()
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})

    game_data_map = {}
    tasks = [(row["league_id"], row["game_id"]) for _, row in played.iterrows()]

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_game = {
            executor.submit(download_match_summary, session, league_id, game_id): game_id
            for league_id, game_id in tasks
        }
        completed = 0
        for future in concurrent.futures.as_completed(future_to_game):
            game_id, data = future.result()
            if data:
                game_data_map[game_id] = data
            completed += 1
            if completed % 50 == 0 or completed == len(tasks):
                print(f"  Processed {completed}/{len(tasks)} matches ({round(time.time() - t0, 1)}s)...")

    print(f"Successfully loaded summaries for {len(game_data_map)} matches.")

    # Parse player statistics
    print("\nParsing player stats for each match and roster...")
    records = []

    for _, match in played.iterrows():
        game_id = match["game_id"]
        data = game_data_map.get(game_id)
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
                if not player_name:
                    continue

                player_entry = {
                    "league": match["league"],
                    "season": match["season"],
                    "date": match["date"].strftime("%Y-%m-%d"),
                    "game": match["game"],
                    "game_id": game_id,
                    "team": team_name,
                    "is_home": (i == 0),
                    "player": player_name,
                    "player_id": athlete.get("id"),
                    "position": p.get("position", {}).get("name") if "position" in p else None,
                    "starter": p.get("starter", False),
                    "jersey": p.get("jersey"),
                }

                if "stats" in p:
                    for stat in p["stats"]:
                        player_entry[stat["name"]] = stat.get("value", 0.0)

                records.append(player_entry)

    df_match_players = pd.DataFrame(records).replace({"team": TEAMNAME_REPLACEMENTS})

    numeric_cols = [
        "totalGoals", "goalAssists", "totalShots", "shotsOnTarget",
        "foulsCommitted", "foulsSuffered", "yellowCards", "redCards",
        "offsides", "ownGoals", "saves", "goalsConceded", "shotsFaced",
        "appearances", "subIns"
    ]
    for col in numeric_cols:
        if col in df_match_players.columns:
            df_match_players[col] = df_match_players[col].fillna(0.0)

    # Save detailed match-by-match player stats
    match_csv_path = Path("c:/Users/emeka/Desktop/statsdor/top5_player_match_stats_2026_2027.csv")
    df_match_players.to_csv(match_csv_path, index=False)
    print(f"\n[Saved] Detailed match player stats saved to: {match_csv_path}")
    print(f"Total player-match logs: {len(df_match_players):,}")

    # Compute season aggregates per player
    print("\nComputing aggregated player season totals...")
    df_match_players["starter_int"] = df_match_players["starter"].astype(int)

    agg_rules = {
        "appearances": "sum",
        "starter_int": "sum",
        "subIns": "sum",
        "totalGoals": "sum",
        "goalAssists": "sum",
        "totalShots": "sum",
        "shotsOnTarget": "sum",
        "foulsCommitted": "sum",
        "foulsSuffered": "sum",
        "yellowCards": "sum",
        "redCards": "sum",
        "offsides": "sum",
        "ownGoals": "sum",
        "saves": "sum",
        "goalsConceded": "sum",
        "shotsFaced": "sum",
    }
    agg_rules = {k: v for k, v in agg_rules.items() if k in df_match_players.columns}

    df_season = (
        df_match_players.groupby(["league", "team", "player", "player_id", "position"], as_index=False)
        .agg(agg_rules)
        .rename(columns={"starter_int": "starts"})
    )

    # Calculate key analytical ratios
    df_season["shooting_accuracy_pct"] = (
        (df_season["shotsOnTarget"] / df_season["totalShots"] * 100.0)
        .where(df_season["totalShots"] > 0, 0.0)
        .round(1)
    )
    df_season["goal_conversion_pct"] = (
        (df_season["totalGoals"] / df_season["totalShots"] * 100.0)
        .where(df_season["totalShots"] > 0, 0.0)
        .round(1)
    )
    df_season["goal_contributions"] = df_season["totalGoals"] + df_season["goalAssists"]

    # Sort by total goals, then goal contributions, then total shots
    df_season = df_season.sort_values(by=["totalGoals", "goal_contributions", "totalShots"], ascending=False)

    season_csv_path = Path("c:/Users/emeka/Desktop/statsdor/top5_player_season_stats_2026_2027.csv")
    df_season.to_csv(season_csv_path, index=False)
    print(f"[Saved] Aggregated season player stats saved to: {season_csv_path}")
    print(f"Total unique players across Top 5 Leagues: {len(df_season):,}")

    print("\n=== TOP 15 GOALSCORERS ACROSS TOP 5 LEAGUES (2026/2027) ===")
    top_scorers = df_season[["player", "team", "league", "position", "appearances", "totalGoals", "goalAssists", "totalShots", "shotsOnTarget", "shooting_accuracy_pct"]].head(15)
    print(top_scorers.to_string(index=False))

    print("\n=== TOP 15 PLAYERS BY TOTAL SHOTS (2026/2027) ===")
    top_shooters = df_season.sort_values(by="totalShots", ascending=False)[["player", "team", "league", "position", "appearances", "totalGoals", "totalShots", "shotsOnTarget", "shooting_accuracy_pct"]].head(15)
    print(top_shooters.to_string(index=False))

    print("\n=== TOP 15 PLAYERS BY ASSISTS (2026/2027) ===")
    top_assisters = df_season.sort_values(by="goalAssists", ascending=False)[["player", "team", "league", "position", "appearances", "goalAssists", "totalGoals", "goal_contributions"]].head(15)
    print(top_assisters.to_string(index=False))


if __name__ == "__main__":
    main()
