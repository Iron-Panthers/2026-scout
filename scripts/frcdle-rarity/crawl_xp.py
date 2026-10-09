"""Fetch each team's season xP and event weeks from Match13, one request every 2s
(the pace match13.com/robots.txt asks for).

Usage: python3 -I scripts/frcdle-rarity/crawl_xp.py teams.json xp.jsonl [limit]
teams.json comes from fetch_tba_teams.py. Resumable: teams already in xp.jsonl
are skipped. build_snapshot.py decides which events count as on-season.
"""
import json, re, sys, time, urllib.error, urllib.request

YEAR = 2026
teams_path, out_path = sys.argv[1], sys.argv[2]
limit = int(sys.argv[3]) if len(sys.argv) > 3 else None

teams = [t["team"] for t in json.load(open(teams_path))]
done = set()
try:
    for line in open(out_path):
        done.add(json.loads(line)["team"])
except FileNotFoundError:
    pass

todo = [t for t in teams if t not in done][:limit]
print(f"{len(done)} done, {len(todo)} to fetch", flush=True)

season_re = re.compile(rf"(?:^|\n)##\s*{YEAR}\s+season\s*\n", re.I)
xp_re = re.compile(r"xP rating:\s*\*\*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\*\*", re.I)
matches_re = re.compile(r"\bover\s+(\d+)\s+matches\b", re.I)


def fetch(team):
    req = urllib.request.Request(
        f"https://www.match13.com/team/{team}",
        headers={"Accept": "text/markdown", "User-Agent": "frcdle-rarity-table/1.0 (2s delay)"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def parse(team, md):
    rec = {"team": team, "xp": None, "matches": 0, "events": []}
    m = season_re.search(md)
    if not m:
        return rec
    section = re.split(r"\n##\s", md[m.end():])[0]
    if xp := xp_re.search(section):
        rec["xp"] = float(xp.group(1))
    if played := matches_re.search(section):
        rec["matches"] = int(played.group(1))
    # | Event | Key | Week | Rank | ... — keep [key, week] for each event row.
    for line in section.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 3 and cells[1].startswith(str(YEAR)):
            rec["events"].append([cells[1], int(cells[2]) if cells[2].isdigit() else None])
    return rec


with open(out_path, "a") as out:
    for i, team in enumerate(todo):
        if i:
            time.sleep(2)
        rec = None
        for attempt in range(3):
            try:
                rec = parse(team, fetch(team))
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    rec = {"team": team, "xp": None, "matches": 0, "events": []}
                    break
                print(f"team {team}: HTTP {e.code}, retrying", flush=True)
            except Exception as e:  # network hiccup: back off and retry
                print(f"team {team}: {e}, retrying", flush=True)
            time.sleep(10)
        if rec is None:
            print(f"failed {team}", flush=True)
            continue
        out.write(json.dumps(rec) + "\n")
        out.flush()
        if i % 100 == 0:
            print(f"{i}/{len(todo)} team {team} xp={rec['xp']} events={len(rec['events'])}", flush=True)
print("done", flush=True)
