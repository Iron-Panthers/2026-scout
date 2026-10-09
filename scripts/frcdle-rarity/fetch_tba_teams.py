"""List every team registered for the season (team number >= 10) with its nickname.

Usage: TBA_AUTH_KEY=... python3 -I scripts/frcdle-rarity/fetch_tba_teams.py teams.json
"""
import json, os, sys, urllib.request

YEAR = 2026
out_path = sys.argv[1]
key = os.environ["TBA_AUTH_KEY"]

teams = []
for page in range(100):
    req = urllib.request.Request(
        f"https://www.thebluealliance.com/api/v3/teams/{YEAR}/{page}/simple",
        headers={"X-TBA-Auth-Key": key, "User-Agent": "frcdle-rarity-table/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.load(r)
    if not batch:
        break
    teams += [
        {"team": t["team_number"], "nickname": t.get("nickname") or t.get("name") or f"FRC Team {t['team_number']}"}
        for t in batch
        if t["team_number"] >= 10
    ]

teams.sort(key=lambda t: t["team"])
json.dump(teams, open(out_path, "w"))
print(f"{len(teams)} teams")
