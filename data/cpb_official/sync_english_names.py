#!/usr/bin/env python3
"""Regenerate src/lib/playerNamesEn.json — English team names and a
"<team code>-<jersey number>" -> English player name lookup.

Name text: the league's 40-man list (roster_sheet.json, see build_roster_sheet.py),
spelled and ordered exactly as the sheet has it (Chinese/Japanese/Korean players
family name first, everyone else given names first). Only the formatting is
tidied: separators (, ， .) become spaces and ALL-CAPS becomes Title Case.
For the few players the sheet doesn't have (they joined later), the official
site's name (family name first) is used.

Bold marking: the official site prints the family name in bold
("<strong>Chen</strong> Guan-Xun" on the team roster pages). The sheet has no such
marking, so the family name is looked up on the official site (roster page, else
box_scores lastname) and located inside the sheet's text; that stretch is what the
app shows in bold. If it can't be found in the sheet's spelling (e.g. the sheet
glued two words together) that player simply gets no bold part.

Each entry: {"name": "Chen Guan Xun", "family": "Chen"}  ("family" omitted = no bold)
english_name_overrides.json ({"CODE-number": {"name": .., "family": ..}}) is applied last.

Usage: python3 sync_english_names.py
"""
import glob
import html
import json
import re
import unicodedata
from pathlib import Path

from fetch_official import SCHEDULE_URL, fetch_data_page
from import_to_supabase import OFFICIAL_BASE, http_get

HERE = Path(__file__).parent
OUT = HERE.parent.parent / "src" / "lib" / "playerNamesEn.json"
CJK = re.compile(r"[一-鿿]+")

# The sheet lists CSW's Liu Wenlong as #27, but the official roster and every box
# score have him as #99 (#27 is Zhao Weitian). The official numbering wins.
SHEET_NUMBER_FIXES = {"CSW-27": "CSW-99"}

# <td class="text-center">60</td> <td class="player"><a href=".."><strong>Chen</strong> Guan-Xun</a></td>
ROW = re.compile(
    r'<td[^>]*>\s*(\d+)\s*</td>\s*<td class="player">\s*<a[^>]*>\s*<strong>(.*?)</strong>(.*?)</a>',
    re.S,
)


def clean(s):
    s = html.unescape(re.sub(r"<[^>]+>", "", s or ""))
    return " ".join(CJK.sub("", s).replace(" - ", " ").split()).strip(" -")


def tidy(raw):
    s = CJK.sub("", raw or "")
    s = re.sub(r"[,，.]+", " ", s)
    s = re.sub(r"\s*-\s*$", "", s.strip())
    s = " ".join(s.replace("\xa0", " ").split())
    return s.title() if s.isupper() else s


def norm(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def find_family(name, family):
    """The stretch of `name` (as spelled there) that is the official family name, or None."""
    words, fam = name.split(), [norm(w) for w in family.split()]
    for i in range(len(words) - len(fam) + 1):
        if [norm(w) for w in words[i:i + len(fam)]] == fam:
            return " ".join(words[i:i + len(fam)])
    return None


def main():
    games = fetch_data_page(SCHEDULE_URL)["props"]["games"]
    teams = {}  # code -> (cpb team id, English name)
    cpb_to_code = {}
    for g in games:
        for side in ("home", "away"):
            if g.get(f"{side}ioc"):
                teams[g[f"{side}ioc"]] = (g[f"{side}id"], g[f"{side}label"])
                cpb_to_code[g[f"{side}id"]] = g[f"{side}ioc"]

    # official site: key -> (family, given)
    official = {}
    for code, (cpb_id, _label) in sorted(teams.items()):
        page = http_get(f"{OFFICIAL_BASE}/teams/{cpb_id}")
        for number, family, given in ROW.findall(page):
            if clean(family):
                official[f"{code}-{int(number)}"] = (clean(family), clean(given))
    for path in sorted(glob.glob(str(HERE / "box_scores" / "*.json"))):
        box = json.loads(Path(path).read_text(encoding="utf-8")).get("boxScore") or {}
        for team_key, spots in box.items():
            code = cpb_to_code.get(int(team_key)) if str(team_key).isdigit() else None
            if not code or not isinstance(spots, dict):
                continue
            for rows in spots.values():
                for r in rows if isinstance(rows, list) else []:
                    if isinstance(r, dict) and r.get("uniform") is not None and r.get("lastname"):
                        official.setdefault(f"{code}-{int(r['uniform'])}", (clean(r["lastname"]), clean(r.get("firstname"))))

    # name text: the sheet first, the official site for anyone the sheet lacks
    texts = {}
    sheet_path = HERE / "roster_sheet.json"
    for r in json.loads(sheet_path.read_text(encoding="utf-8")):
        key = SHEET_NUMBER_FIXES.get(f"{r['code']}-{r['number']}", f"{r['code']}-{r['number']}")
        if tidy(r["en"]):
            texts[key] = tidy(r["en"])
    from_official = []
    for key, (family, given) in official.items():
        if key not in texts:
            texts[key] = f"{family} {given}".strip()
            from_official.append(key)

    players, unmatched = {}, []
    for key, name in texts.items():
        entry = {"name": name}
        fam = official.get(key)
        if fam:
            found = find_family(name, fam[0])
            if found:
                entry["family"] = found
            else:
                unmatched.append((key, name, fam[0]))
        players[key] = entry

    overrides_path = HERE / "english_name_overrides.json"
    if overrides_path.exists():
        players.update(json.loads(overrides_path.read_text(encoding="utf-8")))

    result = {"teams": {c: label for c, (_i, label) in sorted(teams.items())}, "players": players}
    new = json.dumps(result, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    if OUT.exists() and OUT.read_text(encoding="utf-8") == new:
        print(f"no change ({len(players)} players)")
    else:
        OUT.write_text(new, encoding="utf-8")
        print(f"wrote {OUT} ({len(players)} players)")
    print(f"  {len(from_official)} not on the sheet, taken from the official site: {sorted(from_official)}")
    print(f"  {len(unmatched)} with no bold part (official family name not found in the sheet's spelling):")
    for key, name, fam in sorted(unmatched):
        print(f"    {key}: sheet '{name}' / official family '{fam}'")


if __name__ == "__main__":
    main()
