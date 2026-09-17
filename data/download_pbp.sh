#!/bin/bash
# Download all CPB play-by-play JSON files
BASE="https://cpb-match-visualizer.onrender.com/static_games"
OUT="$(dirname "$0")/cpb_pbp"
mkdir -p "$OUT"

GAMES="G01 G02 G03 G04 G05 G06 G07 G08 G09 G10 G11 G12 G13 G14 G15 G16 G17 G18 G19 G21 G22 G23 G24 G25 G26 G27 G28 G29 G30 G31 G32 G33 G34"

curl -s "$BASE/catalog.json" -o "$OUT/catalog.json" && echo "✓ catalog.json"

for CODE in $GAMES; do
  curl -s "$BASE/$CODE.json" -o "$OUT/$CODE.json" && echo "✓ $CODE.json"
done

echo ""
echo "Done! $(ls "$OUT"/*.json | wc -l) files saved to $OUT"
