#!/usr/bin/env python3
"""Regenerate src/lib/playerNamesEn.json — English team names and a
"<team code>-<jersey number>" -> English player name lookup, spelled exactly the
way the official cpbofficial.com site writes them.

The official site prints every name family-name-first with the family name in
bold, e.g. "<strong>Chen</strong> Guan-Xun". The file keeps that split
({"family": "Chen", "given": "Guan-Xun"}) so the app can bold the family name too.

Sources, best first:
  1. the official team roster pages (current roster; family name = the bold part)
  2. box_scores/*.json (lastname / firstname) for players who have played but are
     no longer on the roster page
then english_name_overrides.json ({"CODE-number": {"family": .., "given": ..}})
is applied on top, for the odd hand fix.

Usage: python3 sync_english_names.py
"""
import glob
import html
import json
import re
from pathlib import Path

from fetch_official import SCHEDULE_URL, fetch_data_page
from import_to_supabase import OFFICIAL_BASE, http_get

HERE = Path(__file__).parent
OUT = HERE.parent.parent / "src" / "lib" / "playerNamesEn.json"

# <td class="text-center">60</td> <td class="player"><a href=".."><strong>Chen</strong> Guan-Xun</a></td>
ROW = re.compile(
    r'<td[^>]*>\s*(\d+)\s*</td>\s*<td class="player">\s*<a[^>]*>\s*<strong>(.*?)</strong>(.*?)</a>',
    re.S,
)


def clean(s):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", "", s or "")).split())


def main():
    games = fetch_data_page(SCHEDULE_URL)["props"]["games"]
    teams = {}  # code -> (cpb team id, English name)
    cpb_to_code = {}
    for g in games:
        for side in ("home", "away"):
            if g.get(f"{side}ioc"):
                teams[g[f"{side}ioc"]] = (g[f"{side}id"], g[f"{side}label"])
                cpb_to_code[g[f"{side}id"]] = g[f"{side}ioc"]

    players = {}  # "SHO-60" -> {"family": .., "given": ..}

    for code, (cpb_id, _label) in sorted(teams.items()):
        page = http_get(f"{OFFICIAL_BASE}/teams/{cpb_id}")
        for number, family, given in ROW.findall(page):
            family, given = clean(family), clean(given)
            if family:
                players[f"{code}-{int(number)}"] = {"family": family, "given": given}

    from_roster = len(players)
    for path in sorted(glob.glob(str(HERE / "box_scores" / "*.json"))):
        box = json.loads(Path(path).read_text(encoding="utf-8")).get("boxScore") or {}
        for team_key, spots in box.items():
            code = cpb_to_code.get(int(team_key)) if str(team_key).isdigit() else None
            if not code or not isinstance(spots, dict):
                continue
            for rows in spots.values():
                for r in rows if isinstance(rows, list) else []:
                    if isinstance(r, dict) and r.get("uniform") is not None and r.get("lastname"):
                        key = f"{code}-{int(r['uniform'])}"
                        if key not in players:
                            players[key] = {"family": clean(r["lastname"]), "given": clean(r.get("firstname"))}

    overrides_path = HERE / "english_name_overrides.json"
    if overrides_path.exists():
        players.update(json.loads(overrides_path.read_text(encoding="utf-8")))

    result = {"teams": {c: label for c, (_i, label) in sorted(teams.items())}, "players": players}
    new = json.dumps(result, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    if OUT.exists() and OUT.read_text(encoding="utf-8") == new:
        print(f"no change ({len(players)} players)")
        return
    OUT.write_text(new, encoding="utf-8")
    print(f"wrote {OUT} ({len(players)} players: {from_roster} from roster pages, "
          f"{len(players) - from_roster} from box scores)")


if __name__ == "__main__":
    main()
