#!/usr/bin/env python3
"""Import official CPB box-score pitch/at-bat data into Supabase.

Populates:
  pitch_location_stats  (25-zone faced-pitch counts, one row per player per game)
  game_stats.at_bats    (per-plate-appearance result / firstPitchStrike / pitchZone)

Matching: CPB numeric team/player ids -> our Supabase rows, via
  team code (BJL/SHO/FZS/XMD/CSW/SZB, taken straight from gameData.homeioc/awayioc)
  + uniform number (looked up per-game from boxScore, since CPB player ids
    aren't stored in our players table — only team + jersey number are stable).

Zone indexing (must match the existing frontend convention used by
PitchZoneHeatMap/HitZoneHeatMap in src/app/teams/[id]/[playerId]/page.tsx):
  the stored zoneCounts[25] array's column 0 = outside, column 4 = inside
  (this is what the app calls "pitcher's view" and treats as canonical
  storage order; isPitcher just decides whether to mirror it for display).
  Row 0 = high, row 4 = low (never mirrored).

Strike-zone raw bounds (solved from data/cpb_pbp/*.json's paired raw/norm
fields): pitchoutside in [-17, 17], pitchheight in [15, 60].

Pitch classification: the ball/called/foul/swing/inplay flags on CPB's raw
play rows are always 0 (unused/broken upstream) except hbp, which is
sometimes set. Real classification has to come from `narrative` text for
mid-at-bat pitches, and from outcome flags (bb/hbp/strikeout/h/double/
triple/homerun) for the at-bat-ending pitch (marked pa==1).

Usage:
  python3 import_to_supabase.py            # dry run, prints a summary, writes nothing
  python3 import_to_supabase.py --commit   # actually writes to Supabase
"""
import glob
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
ENV_FILE = HERE.parent.parent / ".env.local"

LOCATED_TYPES = {"called_strike", "swinging_strike", "foul", "in_play"}

# ── env / supabase client ────────────────────────────────────────────────────

def load_env():
    env = {}
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k] = v
    return env


ENV = load_env()
SUPABASE_URL = ENV["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = ENV["NEXT_PUBLIC_SUPABASE_ANON_KEY"]


def sb_request(method, path, body=None, extra_headers=None):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            b = resp.read()
            return resp.status, (json.loads(b) if b else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def sb_get_all(path):
    """GET with Range-header pagination — PostgREST caps a single response at
    1000 rows by default, and this project has passed that on both tables, so
    a plain sb_request GET silently truncates and makes the caller think rows
    that already exist are new (risking duplicate inserts)."""
    all_rows = []
    offset = 0
    while True:
        status, batch = sb_request("GET", path, extra_headers={"Range": f"{offset}-{offset + 999}"})
        assert status in (200, 206), (status, batch)
        all_rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return all_rows


# ── zone binning (see module docstring for the convention) ──────────────────

OUTSIDE_MIN, OUTSIDE_MAX = -17.0, 17.0
HEIGHT_MIN, HEIGHT_MAX = 15.0, 60.0


def _natural_bin(value, lo, hi):
    """0 = below lo, 1-3 = three equal thirds of [lo,hi], 4 = above hi.
    Both edges are in-zone (matches the official is_in_strike_zone rule); the
    middle 3x3 of the 5x5 is exactly the strike zone, the outer ring is outside it."""
    if value < lo:
        return 0
    if value > hi:
        return 4
    third = (hi - lo) / 3.0
    return 1 + min(2, int((value - lo) / third))


def zone_index(pitchoutside, pitchheight):
    natural_col = _natural_bin(pitchoutside, OUTSIDE_MIN, OUTSIDE_MAX)  # 0=far inside .. 4=far outside
    natural_row = _natural_bin(pitchheight, HEIGHT_MIN, HEIGHT_MAX)     # 0=very low .. 4=very high
    col = 4 - natural_col   # storage: col0=outside, col4=inside
    row = 4 - natural_row   # storage: row0=high, row4=low
    return row * 5 + col


# ── pitch classification ─────────────────────────────────────────────────────

def classify_pitch(row):
    n = row.get("narrative", "").strip()
    if n.startswith("Ball"):
        return "ball"
    if n == "Foul.":
        return "foul"
    if n.startswith("Called Strike"):
        return "called_strike"
    if n.startswith("Swinging Strike"):
        return "swinging_strike"
    # at-bat-ending pitch: use outcome flags, not the (always-0) type flags
    if row.get("hbp") == 1 or "hit by pitch" in n.lower():
        return "hbp"
    if row.get("bb") == 1 or row.get("ibb") == 1:
        return "ball"
    if row.get("strikeout") == 1 or row.get("kl") == 1:
        return "swinging_strike" if "swinging" in n.lower() else "called_strike"
    return "in_play"


FIELDER_PATTERNS = [
    re.compile(r"\bSF(\d)\b"),                        # sacrifice fly, e.g. "SF9."
    re.compile(r"\bFF(\d)\b"),                         # foul flyout/popout, e.g. "FF3."
    re.compile(r"Bunt\s+(\d(?:-\d)*U?)"),              # bunt grounder, e.g. "Bunt 1-3."
    re.compile(r"grounds? out\.?\s*(\d(?:-\d)*U?)"),   # grounds out (with or without "Bunt")
    re.compile(r"\bF(\d)\b"),
    re.compile(r"lines? out.*?(\d)\b"),
    re.compile(r"pops? out.*?(\d)\b"),
]


def derive_result(row):
    # Priority order matters: structured outcome flags (strikeout/bb/hbp/sac/...)
    # are authoritative and must be checked before any text-pattern fallback on
    # `narrative`, since a sac-bunt narrative can also contain phrases like
    # "fielders choice" or a "grounds out" style fielder sequence that would
    # otherwise be matched first and mislabel a sacrifice as something else
    # (e.g. "FC") — which matters because AB-exclusion (BB/IBB/HBP/SAC) is
    # driven by this returned label downstream.
    n = row.get("narrative", "")
    if row.get("strikeout") == 1 or row.get("kl") == 1:
        return "K"
    if row.get("bb") == 1:
        return "IBB" if row.get("ibb") == 1 else "BB"
    if row.get("hbp") == 1:
        return "HBP"
    if row.get("sac") == 1:
        return "SAC"
    if row.get("sf") == 1:
        return "SF"
    if "catcher's interference" in n.lower() or "catcher interference" in n.lower():
        # NOT the same as "Interfering With Catcher" (that's the batter's own
        # fault and he's out — a normal AB) — this is the catcher illegally
        # interfering with the batter, who's awarded first base, no AB charged.
        return "CI"
    if row.get("homerun") == 1:
        for pat in FIELDER_PATTERNS:
            m = pat.search(n)
            if m:
                return m.group(1) + "HR"
        return "HR"
    if row.get("triple") == 1:
        return "3B"
    if row.get("double") == 1:
        return "2B"
    if row.get("h") == 1:
        return "1B"
    if row.get("gdp") == 1:
        return "GDP"
    if "fielders choice" in n.lower():
        return "FC"
    for pat in FIELDER_PATTERNS:
        m = pat.search(n)
        if m:
            return m.group(1)
    if row.get("roe") == 1:
        return "ROE"
    return ">"


# result codes that do NOT count as an at-bat (AB) even though they're a plate
# appearance (PA) — matches official scoring: BB/IBB/HBP/SAC are PA, not AB.
NON_AB_RESULTS = {"BB", "IBB", "HBP", "SAC", "SF", "CI"}


# ── Supabase reference data ──────────────────────────────────────────────────

def load_supabase_refs():
    status, teams = sb_request("GET", "teams?select=id,name,short_name")
    assert status == 200, teams
    code_to_team_id = {}
    for t in teams:
        m = re.search(r"([A-Z]{3})$", t["name"])
        if m:
            code_to_team_id[m.group(1)] = t["id"]
    assert len(code_to_team_id) == 6, f"expected 6 team codes, got {code_to_team_id}"

    status, players = sb_request("GET", "players?select=id,team_id,name,number,position&limit=1000")
    assert status == 200, players
    team_number_to_player = {(p["team_id"], str(int(p["number"]))): p["id"] for p in players}
    position_by_player = {p["id"]: p["position"] for p in players}

    team_id_to_name = {t["id"]: t["name"] for t in teams}
    return code_to_team_id, team_number_to_player, team_id_to_name, position_by_player


# ── per-game processing ──────────────────────────────────────────────────────

def build_playerid_to_uniform(box_score, cpb_team_id):
    m = {}
    team_box = box_score.get(str(cpb_team_id)) or box_score.get(cpb_team_id) or {}
    for rows in team_box.values():
        for r in rows:
            if "playerid" in r and "uniform" in r:
                m[r["playerid"]] = r["uniform"]
    return m


def iter_plays_in_order(game_plays_all):
    for inning in sorted(game_plays_all.keys(), key=int):
        for half in ("top", "bot"):
            for row in game_plays_all[inning].get(half) or []:
                yield row


def process_game(path, code_to_team_id, team_number_to_player, team_id_to_name, position_by_player):
    data = json.loads(Path(path).read_text())
    game_data = data.get("gameData")
    game_plays = (data.get("gamePlays") or {}).get("all")
    if not game_data or not game_plays:
        return None  # not yet played

    game_date = game_data["start"].split(" ")[0]
    home_cpb_id, away_cpb_id = game_data["homeid"], game_data["awayid"]
    home_code, away_code = game_data["homeioc"], game_data["awayioc"]
    if home_code not in code_to_team_id or away_code not in code_to_team_id:
        return None  # not one of our 6 CPB teams (shouldn't happen this tournament)

    home_team_id = code_to_team_id[home_code]
    away_team_id = code_to_team_id[away_code]

    box_score = data.get("boxScore") or {}
    uniform_by_cpbid = {}
    uniform_by_cpbid.update(build_playerid_to_uniform(box_score, home_cpb_id))
    uniform_by_cpbid.update(build_playerid_to_uniform(box_score, away_cpb_id))

    def resolve_player(cpb_player_id, is_home):
        uniform = uniform_by_cpbid.get(cpb_player_id)
        if uniform is None:
            return None, None
        team_id = home_team_id if is_home else away_team_id
        player_id = team_number_to_player.get((team_id, str(int(uniform))))
        return player_id, team_id

    # accumulators, keyed by player_id
    # pitch_location_stats has two, mutually exclusive, meanings depending on the
    # player's position (see PitchZoneHeatMap in the frontend): for a pitcher it's
    # "pitches they threw" (投球位置), for anyone else it's "pitches they faced"
    # (面对来球位置). So a batter who's a pitcher by position doesn't get a
    # faced-pitches row here even if they batted that game — only a thrown-pitches one.
    faced_zone_counts_by_batter = {}
    thrown_zone_counts_by_pitcher = {}
    team_id_by_player = {}
    at_bats_by_player = {}
    batting_order_by_player = {}
    unresolved = set()

    current_pitches = []  # buffered pitches of the in-progress plate appearance
    current_batter_cpb_id = None

    for row in iter_plays_in_order(game_plays):
        if row.get("pitch_pitches") != 1:
            continue
        is_home_batting = bool(row.get("home"))
        batter_cpb_id = row["batterid"]
        if batter_cpb_id != current_batter_cpb_id:
            current_pitches = []
            current_batter_cpb_id = batter_cpb_id

        ptype = classify_pitch(row)
        current_pitches.append({"type": ptype, "outside": row.get("pitchoutside"), "height": row.get("pitchheight")})

        batter_id, batter_team_id = resolve_player(batter_cpb_id, is_home_batting)
        pitcher_id, pitcher_team_id = resolve_player(row["pitcherid"], not is_home_batting)

        if batter_id is None:
            unresolved.add(batter_cpb_id)
        else:
            team_id_by_player[batter_id] = batter_team_id
            if ptype in LOCATED_TYPES and position_by_player.get(batter_id) != "P":
                zc = faced_zone_counts_by_batter.setdefault(batter_id, [0] * 25)
                zc[zone_index(row["pitchoutside"], row["pitchheight"])] += 1
            batting_order_by_player.setdefault(batter_id, row.get("lineuporder"))

        if pitcher_id is None:
            unresolved.add(row["pitcherid"])
        else:
            team_id_by_player[pitcher_id] = pitcher_team_id
            if ptype in LOCATED_TYPES:
                zc = thrown_zone_counts_by_pitcher.setdefault(pitcher_id, [0] * 25)
                zc[zone_index(row["pitchoutside"], row["pitchheight"])] += 1

        if row.get("pa") == 1:
            if batter_id is not None:
                first = current_pitches[0]
                first_pitch_strike = first["type"] not in ("ball", "hbp")
                final = current_pitches[-1]
                pitch_zone = (
                    zone_index(final["outside"], final["height"])
                    if final["type"] in LOCATED_TYPES
                    else None
                )
                ab = {"result": derive_result(row), "firstPitchStrike": first_pitch_strike}
                if pitch_zone is not None:
                    ab["pitchZone"] = pitch_zone
                at_bats_by_player.setdefault(batter_id, []).append(ab)
            current_pitches = []
            current_batter_cpb_id = None

    def opponent_name_for(team_id):
        opponent_id = away_team_id if team_id == home_team_id else home_team_id
        return team_id_to_name[opponent_id]

    rows_pitch_location = []
    for player_id, zc in {**faced_zone_counts_by_batter, **thrown_zone_counts_by_pitcher}.items():
        if sum(zc) == 0:
            continue
        team_id = team_id_by_player.get(player_id)
        rows_pitch_location.append({
            "player_id": player_id,
            "game_date": game_date,
            "opponent": opponent_name_for(team_id),
            "zone_counts": zc,
        })

    rows_game_stats = []
    for player_id, at_bats in at_bats_by_player.items():
        team_id = team_id_by_player.get(player_id)
        rows_game_stats.append({
            "team_id": team_id,
            "player_id": player_id,
            "game_date": game_date,
            "opponent": opponent_name_for(team_id),
            "batting_order": batting_order_by_player.get(player_id) or 0,
            "at_bats": at_bats,
        })

    return {
        "game_id": game_data["id"],
        "title": game_data["title"],
        "game_date": game_date,
        "pitch_location_rows": rows_pitch_location,
        "game_stats_rows": rows_game_stats,
        "unresolved_batter_ids": unresolved,
    }


def main():
    commit = "--commit" in sys.argv
    code_to_team_id, team_number_to_player, team_id_to_name, position_by_player = load_supabase_refs()

    # existing (player_id, game_date) pairs already in the DB — never duplicate.
    # pitch_location_stats is insert-only (its content only depends on zone_index /
    # classify_pitch, which haven't changed); game_stats is upserted since
    # derive_result's classification logic can be refined after rows already exist
    # (e.g. a sac-bunt narrative that also matched "fielders choice" text used to
    # get mislabeled "FC" instead of "SAC") — those need their at_bats corrected
    # in place, not silently left stale.
    existing_pls = sb_get_all("pitch_location_stats?select=id,player_id,game_date,zone_counts")
    existing_gs = sb_get_all("game_stats?select=id,player_id,game_date,at_bats")
    existing_pls_by_key = {(r["player_id"], r["game_date"]): r for r in existing_pls}
    existing_gs_by_key = {(r["player_id"], r["game_date"]): r for r in existing_gs}

    box_score_files = sorted(glob.glob(str(HERE / "box_scores" / "*.json")))

    total_pls, total_gs, total_skipped_pls, total_skipped_gs, total_updated_gs, total_updated_pls = 0, 0, 0, 0, 0, 0
    all_unresolved = set()
    games_processed = 0

    for path in box_score_files:
        result = process_game(path, code_to_team_id, team_number_to_player, team_id_to_name, position_by_player)
        if result is None:
            continue
        games_processed += 1
        all_unresolved |= result["unresolved_batter_ids"]

        for row in result["pitch_location_rows"]:
            key = (row["player_id"], row["game_date"])
            existing = existing_pls_by_key.get(key)
            if existing is None:
                total_pls += 1
                if commit:
                    status, res = sb_request("POST", "pitch_location_stats", body=row)
                    if status >= 300:
                        print(f"  FAILED pitch_location_stats insert {row['player_id']} {row['game_date']}: {res}")
            elif [int(v) for v in existing["zone_counts"]] != row["zone_counts"]:
                total_updated_pls += 1
                if commit:
                    status, res = sb_request(
                        "PATCH", f"pitch_location_stats?id=eq.{existing['id']}",
                        body={"zone_counts": row["zone_counts"]},
                    )
                    if status >= 300:
                        print(f"  FAILED pitch_location_stats update {row['player_id']} {row['game_date']}: {res}")
            else:
                total_skipped_pls += 1

        for row in result["game_stats_rows"]:
            key = (row["player_id"], row["game_date"])
            existing = existing_gs_by_key.get(key)
            if existing is None:
                total_gs += 1
                if commit:
                    status, res = sb_request("POST", "game_stats", body=row)
                    if status >= 300:
                        print(f"  FAILED game_stats insert {row['player_id']} {row['game_date']}: {res}")
            elif existing["at_bats"] != row["at_bats"]:
                total_updated_gs += 1
                if commit:
                    status, res = sb_request(
                        "PATCH", f"game_stats?id=eq.{existing['id']}",
                        body={"at_bats": row["at_bats"]},
                    )
                    if status >= 300:
                        print(f"  FAILED game_stats update {row['player_id']} {row['game_date']}: {res}")
            else:
                total_skipped_gs += 1

    print(f"games processed: {games_processed}/{len(box_score_files)}")
    print(f"pitch_location_stats rows: {total_pls} new, {total_updated_pls} updated (zone corrected), {total_skipped_pls} unchanged")
    print(f"game_stats rows: {total_gs} new, {total_updated_gs} updated (corrected classification), {total_skipped_gs} unchanged")
    print(f"unresolved batter cpb ids (no matching team+uniform in Supabase): {len(all_unresolved)}")
    if not commit:
        print("\n(dry run — pass --commit to actually write to Supabase)")


if __name__ == "__main__":
    main()
