import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("pdf") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            } as never,
            {
              type: "text",
              text: `这是一张棒球「投球位置首球好球记录表」。

重要规则：
- 表格顶部有两支队伍名称，其中**名字下方有波浪线（波浪底线）的队伍是进攻方（打击方）**，请仔细识别哪个队名有波浪底线
- 左侧按打击顺序（1棒到9棒）列出的是进攻方球员的姓名和背号
- 每个球员对应多次打席，每次打席记录：打击结果、首球在投球位置格内的位置、首球是否为好球（Y/N）

投球位置区域（5×5格，格子编号如下，共25格）：
┌────┬────┬────┬────┬────┐
│  0 │  1 │  2 │  3 │  4 │  ← 最高区
├────┼────┼────┼────┼────┤
│  5 │  6 │  7 │  8 │  9 │  ← 高区
├────┼────┼────┼────┼────┤
│ 10 │ 11 │ 12 │ 13 │ 14 │  ← 中区
├────┼────┼────┼────┼────┤
│ 15 │ 16 │ 17 │ 18 │ 19 │  ← 低区
├────┼────┼────┼────┼────┤
│ 20 │ 21 │ 22 │ 23 │ 24 │  ← 最低区
└────┴────┴────┴────┴────┘
  内角←————————————→外角

请以 JSON 格式返回，只返回 JSON，不要任何其他文字：
{
  "battingTeam": "上海虎鲸棒球俱乐部",
  "pitchingTeam": "北京正大龙棒球俱乐部",
  "players": [
    {
      "battingOrder": 1,
      "name": "张友极",
      "number": "23",
      "atBats": [
        {"result": "K", "firstPitchStrike": true, "pitchZone": 12},
        {"result": "1-3", "firstPitchStrike": false, "pitchZone": 17}
      ]
    }
  ]
}

说明：
- battingTeam: 有波浪底线的队伍名称（进攻方）
- pitchingTeam: 另一支队伍名称（防守方）
- players: 进攻方打击顺序球员列表，每人包含 battingOrder（1-9）、name、number、atBats
- atBats 中 firstPitchStrike: true = 首球好球，false = 首球坏球
- atBats 中 pitchZone: 首球落点对应的格子编号（0-24），若图表中标记了投球位置点则请识别；无法确认时省略该字段
- 如果某个打击顺序没有球员就跳过，atBats 为空则返回 []`,
            },
          ],
        },
      ],
    });

    const text = (response.content[0] as { type: string; text: string }).text;
    // Try to parse as object with battingTeam
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ players: [], battingTeam: null, pitchingTeam: null });
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      players: parsed.players ?? [],
      battingTeam: parsed.battingTeam ?? null,
      pitchingTeam: parsed.pitchingTeam ?? null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
