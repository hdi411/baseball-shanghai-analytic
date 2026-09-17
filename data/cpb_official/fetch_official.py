#!/usr/bin/env python3
"""Pull official CPB box-score data straight from cpbofficial.com.

The site is an Inertia.js app: every page's initial data ships inline as
`<div id="app" data-page="...">`, HTML-entity-escaped JSON. No separate
REST endpoint is needed — we fetch the page HTML and unwrap that attribute.

Usage: python3 fetch_official.py
Writes:
  games_list.json        - the 45 games from the schedule page (id, teams, date, score)
  box_scores/{id}.json    - per game: tournamentInfo, gameData, boxScore, gamePlays
"""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

BASE = "https://www.cpbofficial.com/zh/events/chinese-professional-baseball-summer-game-2026"
SCHEDULE_URL = f"{BASE}/schedule-and-results"
BOX_SCORE_URL = f"{BASE}/schedule-and-results/box-score/{{game_id}}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
}
OUT_DIR = Path(__file__).parent
BOX_SCORE_DIR = OUT_DIR / "box_scores"


def fetch_data_page(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read().decode("utf-8")
    m = re.search(r'<div id="app" data-page="(.*?)"></div>', content, re.S)
    if not m:
        raise RuntimeError(f"data-page attribute not found at {url}")
    return json.loads(html.unescape(m.group(1)))


def main():
    BOX_SCORE_DIR.mkdir(exist_ok=True)

    print("Fetching schedule page...")
    schedule = fetch_data_page(SCHEDULE_URL)
    games = schedule["props"]["games"]
    print(f"  {len(games)} games found")

    games_list = [
        {
            "id": g["id"],
            "title": g["title"],
            "start": g["start"],
            "homeioc": g["homeioc"],
            "awayioc": g["awayioc"],
            "homeruns": g["homeruns"],
            "awayruns": g["awayruns"],
            "gamestatustext": g["gamestatustext"],
            "stadium": g["stadium"],
        }
        for g in games
    ]
    (OUT_DIR / "games_list.json").write_text(
        json.dumps(games_list, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    for i, g in enumerate(games, 1):
        game_id = g["id"]
        out_path = BOX_SCORE_DIR / f"{game_id}.json"
        if out_path.exists():
            cached = json.loads(out_path.read_text(encoding="utf-8"))
            if "all" in (cached.get("gamePlays") or {}):
                print(f"[{i}/{len(games)}] {game_id} already has play data, skipping")
                continue
            print(f"[{i}/{len(games)}] {game_id} cached but had no play data yet, re-checking...")
        print(f"[{i}/{len(games)}] fetching box score {game_id} ({g['title']})...")
        try:
            page = fetch_data_page(BOX_SCORE_URL.format(game_id=game_id))
        except Exception as e:
            print(f"  FAILED: {e}")
            continue
        original = page["props"]["viewData"].get("original")
        if not original:
            print(f"  no data (exception: {page['props']['viewData'].get('exception')})")
            continue
        payload = {
            "tournamentInfo": original.get("tournamentInfo"),
            "gameData": original.get("gameData"),
            "boxScore": original.get("boxScore"),
            "gamePlays": original.get("gamePlays"),
        }
        out_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        time.sleep(0.5)  # be polite

    print("Done.")


if __name__ == "__main__":
    main()
