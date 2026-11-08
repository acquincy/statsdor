"""
Module to fetch and aggregate player-level stats (goals, assists, shots, cards, etc.)
for the 2026/2027 football season using soccerdata.
"""

import json
import pandas as pd
import soccerdata as sd
from soccerdata._config import TEAMNAME_REPLACEMENTS


def fetch_player_season_stats(
    league: str = "ENG-Premier League",
    season: str = "2026-2027",
    match_limit: int | None = None,
    aggregate: bool = True
) -> pd.DataFrame:
    """
    Scrapes matchday player statistics (goals, assists, shots, shots on target, fouls, cards)
    for the specified league and season using soccerdata's ESPN infrastructure.

    Parameters
    ----------
    league : str
        League identifier (e.g., 'ENG-Premier League', 'ESP-La Liga', 'GER-Bundesliga', etc.)
    season : str
        Season string (e.g., '2026-2027')
    match_limit : int, optional
        Limit to the first N played matches (useful for quick testing). None retrieves all played games.
    aggregate : bool
        If True, returns player totals aggregated over the season.
        If False, returns per-match individual player appearances.

    Returns
    -------
    pd.DataFrame
    """
    espn = sd.ESPN(leagues=league, seasons=season)
    schedule = espn.read_schedule().reset_index()

    # Filter to matches that have already been played (past kick-off date)
    played = schedule[schedule["date"] <= pd.Timestamp.now(tz="UTC")].copy()
    if match_limit is not None:
        played = played.iloc[:match_limit]

    urlmask = "https://site.api.espn.com/apis/site/v2/sports/soccer/{}/summary?event={}"
    filemask = "Summary_{}.json"

    player_records = []
    print(f"Fetching player statistics for {len(played)} played matches in {league} ({season})...")

    for _, match in played.iterrows():
        url = urlmask.format(match["league_id"], match["game_id"])
        filepath = espn.data_dir / filemask.format(match["game_id"])
        try:
            reader = espn.get(url, filepath)
            data = json.load(reader)
        except Exception:
            continue

        rosters = data.get("rosters", [])
        for i, team_roster in enumerate(rosters):
            if "roster" not in team_roster:
                continue
            team_name = team_roster.get("team", {}).get("displayName", f"Team {i+1}")
            for p in team_roster["roster"]:
                player_entry = {
                    "game": match["game"],
                    "date": match["date"].strftime("%Y-%m-%d"),
                    "league": match["league"],
                    "season": match["season"],
                    "team": team_name,
                    "is_home": (i == 0),
                    "player": p["athlete"]["displayName"],
                    "player_id": p["athlete"].get("id"),
                    "position": p.get("position", {}).get("name") if "position" in p else None,
                    "starter": p.get("starter", False),
                }
                if "stats" in p:
                    for stat in p["stats"]:
                        player_entry[stat["name"]] = stat.get("value", 0.0)
                player_records.append(player_entry)

    if not player_records:
        return pd.DataFrame()

    df = pd.DataFrame(player_records).replace({"team": TEAMNAME_REPLACEMENTS})

    # Fill missing stat numbers with 0
    numeric_stat_cols = [
        "totalGoals", "goalAssists", "totalShots", "shotsOnTarget",
        "foulsCommitted", "foulsSuffered", "yellowCards", "redCards",
        "saves", "goalsConceded", "shotsFaced", "appearances"
    ]
    for col in numeric_stat_cols:
        if col in df.columns:
            df[col] = df[col].fillna(0)

    if not aggregate:
        return df

    # Aggregate by player and team
    agg_dict = {col: "sum" for col in numeric_stat_cols if col in df.columns}
    agg_df = (
        df.groupby(["player", "team", "position"], as_index=False)
        .agg(agg_dict)
        .sort_values(by=["totalGoals", "totalShots", "goalAssists"], ascending=False)
    )
    return agg_df


if __name__ == "__main__":
    # Example run: Aggregate top players from the 2026/2027 season
    stats = fetch_player_season_stats(
        league="ENG-Premier League",
        season="2026-2027",
        match_limit=10,  # Change to None to scrape all played matches in the season
        aggregate=True
    )
    print("\nTop 15 Players (Goals, Assists, Shots) for 2026/2027:")
    display_cols = ["player", "team", "position", "appearances", "totalGoals", "goalAssists", "totalShots", "shotsOnTarget"]
    print(stats[display_cols].head(15).to_string(index=False))
