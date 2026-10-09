"""Merge the TBA team list and the Match13 crawl into FRCdle's season snapshot.

Only teams that played an on-season event (Match13 week 1 through
LAST_ON_SEASON_WEEK, i.e. through Championship) are kept, with their Match13
season xP. Offseason-only teams are left out, so FRCdle scores them as 0.

Usage: python3 -I scripts/frcdle-rarity/build_snapshot.py teams.json xp.jsonl src/config/frcdleSnapshot2026.json
"""
import datetime, json, sys

YEAR = 2026
LAST_ON_SEASON_WEEK = 8  # Championship

teams_path, xp_path, out_path = sys.argv[1:4]
nicknames = {t["team"]: t["nickname"] for t in json.load(open(teams_path))}

rows, offseason_only, unrated = [], 0, 0
for line in open(xp_path):
    rec = json.loads(line)
    on_season = any(week is not None and 1 <= week <= LAST_ON_SEASON_WEEK for _, week in rec["events"])
    if not on_season or rec["matches"] == 0:
        offseason_only += bool(rec["events"])
        continue
    if rec["xp"] is None:
        unrated += 1
        continue
    rows.append([rec["team"], nicknames.get(rec["team"], f"FRC Team {rec['team']}"), rec["xp"]])

rows.sort()
snapshot = {
    "year": YEAR,
    "capturedAt": datetime.date.today().isoformat(),
    "source": "Match13 season xP, on-season teams only (TBA nicknames)",
    "teams": rows,
}
with open(out_path, "w") as out:
    json.dump(snapshot, out, separators=(",", ":"), ensure_ascii=False)
    out.write("\n")
print(f"{len(rows)} on-season teams; skipped {offseason_only} offseason-only, {unrated} on-season without xP")
