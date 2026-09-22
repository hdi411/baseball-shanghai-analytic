#!/usr/bin/env python3
"""Regenerate src/lib/playerNamesEn.json — English team names and a
"<team code>-<jersey number>" -> English player name lookup.

The Supabase roster only stores Chinese names; the app uses this file to put
the English name next to the Chinese one (e.g. in exported file names).

Sources, best first — the first one that yields a well-formed name wins:
  1. roster_sheet.json   the league's 40-man list (see build_roster_sheet.py)
  2. official team roster pages on cpbofficial.com
  3. box_scores/*.json   English names from the games themselves (players who
                         have since left the roster page)
then english_name_overrides.json ("CODE-number": "Name") is applied on top.
Names are tidied: separators (, ， .) become spaces and ALL-CAPS becomes Title
Case. Names that can't be split ("LIJIANYE", "HeXin") are skipped in favour of
the next source; if no source has a clean one, the least-bad one is kept.

Usage: python3 sync_english_names.py
"""
import glob
import json
import re
from pathlib import Path

from fetch_official import SCHEDULE_URL, fetch_data_page
from import_to_supabase import OFFICIAL_BASE, _TableRows, http_get

HERE = Path(__file__).parent
OUT = HERE.parent.parent / "src" / "lib" / "playerNamesEn.json"
CJK = re.compile(r"[一-鿿]+")


def tidy(raw):
    s = CJK.sub("", raw or "")                    # 'WANG Yang - 王洋' -> 'WANG Yang -'
    s = re.sub(r"[,，.]+", " ", s)                # 'WAN,CHAO-CHING' / 'WANG.JIA.ZHONG'
    s = re.sub(r"\s*-\s*$", "", s.strip())
    s = " ".join(s.split())
    return s.title() if s.isupper() else s


def well_formed(s):
    tokens = s.split()
    # >12 letters in one word (e.g. 'Armandoaddiel') means two words got glued together
    return (len(tokens) >= 2
            and not re.search(r"[a-z][A-Z]", s)
            and all(len(part) <= 12 for t in tokens for part in t.split("-")))


def main():
    games = fetch_data_page(SCHEDULE_URL)["props"]["games"]
    teams = {}  # code -> (cpb team id, English name)
    cpb_to_code = {}
    for g in games:
        teams[g["homeioc"]] = (g["homeid"], g["homelabel"])
        teams[g["awayioc"]] = (g["awayid"], g["awaylabel"])
        cpb_to_code[g["homeid"]], cpb_to_code[g["awayid"]] = g["homeioc"], g["awayioc"]

    candidates = {}  # "SHO-60" -> [names, best source first]

    def add(code, number, name):
        name = tidy(name)
        if name:
            candidates.setdefault(f"{code}-{int(number)}", []).append(name)

    sheet_path = HERE / "roster_sheet.json"
    if sheet_path.exists():
        for r in json.loads(sheet_path.read_text(encoding="utf-8")):
            add(r["code"], r["number"], r["en"])

    for code, (cpb_id, _label) in sorted(teams.items()):
        parser = _TableRows()
        parser.feed(http_get(f"{OFFICIAL_BASE}/teams/{cpb_id}"))
        for r in parser.rows:  # [jersey #, name, positions, bats/throws, year of birth]
            if len(r) >= 5 and r[0].isdigit() and re.fullmatch(r"[LRS]/[LRS]", r[3]):
                add(code, r[0], r[1])

    for path in sorted(glob.glob(str(HERE / "box_scores" / "*.json"))):
        box = json.loads(Path(path).read_text(encoding="utf-8")).get("boxScore") or {}
        for team_key, spots in box.items():
            code = cpb_to_code.get(int(team_key)) if str(team_key).isdigit() else None
            if not code:
                continue
            for rows in spots.values():
                for r in rows:
                    if r.get("uniform") is not None and r.get("lastname"):
                        add(code, r["uniform"], f"{r['lastname']} {r.get('firstname') or ''}")

    result = {"teams": {c: label for c, (_i, label) in sorted(teams.items())}, "players": {}}
    for key, names in candidates.items():
        result["players"][key] = next((n for n in names if well_formed(n)), names[0])

    # hand-fixed names for the few no source gets right (glued-together words etc.)
    overrides_path = HERE / "english_name_overrides.json"
    if overrides_path.exists():
        result["players"].update(json.loads(overrides_path.read_text(encoding="utf-8")))

    new = json.dumps(result, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    if OUT.exists() and OUT.read_text(encoding="utf-8") == new:
        print(f"no change ({len(result['players'])} players)")
        return
    OUT.write_text(new, encoding="utf-8")
    print(f"wrote {OUT} ({len(result['players'])} players)")


if __name__ == "__main__":
    main()
