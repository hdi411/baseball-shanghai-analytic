#!/usr/bin/env python3
"""Turn the league's "40人名单" Excel sheet into data/cpb_official/roster_sheet.json.

Only players are kept, and only what the app needs: team, jersey number,
Chinese + English name, positions, bats/throws. Birthdates, hometowns,
height/weight and all staff rows are deliberately left out (the repo is public).

Usage: python3 build_roster_sheet.py "/path/to/26夏至联赛40人名单-最终版.xlsx"
Needs openpyxl (local use only — the GitHub Action just reads the JSON).
"""
import json
import sys
from pathlib import Path

import openpyxl

OUT = Path(__file__).parent / "roster_sheet.json"
SHEET_CODE = {"福州海侠": "FZS", "厦门海豚": "XMD", "北京正大龙": "BJL",
              "上海虎鲸": "SHO", "长沙旺旺": "CSW", "深圳蓝袜": "SZB"}


def main(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    out = []
    for ws in wb.worksheets:
        code = SHEET_CODE[ws.title]
        it = ws.iter_rows(values_only=True)
        col = {str(h).strip(): i for i, h in enumerate(next(it)) if h}
        for r in it:
            kind = (r[col["人员类型"]] or "").strip()
            number = r[col["球衣号"]]
            if not kind.startswith("球员") or number in (None, ""):
                continue
            out.append({
                "code": code,
                "number": int(number),
                "zh": (r[col["中文姓名"]] or "").strip(),
                "en": (r[col["英文姓名"]] or "").strip(),
                "position": (r[col["位置"]] or "").strip(),
                "bats": (r[col["击球习惯"]] or "").strip() or None,
                "throws": (r[col["投球习惯"]] or "").strip() or None,
            })
    out.sort(key=lambda r: (r["code"], r["number"]))
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.name}: {len(out)} players")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
