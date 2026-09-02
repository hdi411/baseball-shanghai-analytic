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

重要提示：
- 表格顶部有两支队伍名称，其中**名字下方有波浪线（波浪底线）的队伍是进攻方（打击方）**
- 左侧按打击顺序（1棒到9棒）列出攻方球员的姓名和背号
- 每个球员对应多次打席（At-Bat），每次打席记录：
  - 打击结果（如 1-3、6H、7HR、K、BB 等）
  - 首球是否为好球（Y = 好球，N = 坏球）

请从打击顺序栏提取每位球员信息，以及他们每次打席的数据。

请严格以 JSON 格式返回，只返回 JSON 数组，不要任何其他文字：
[
  {
    "battingOrder": 1,
    "name": "张友极",
    "number": "23",
    "atBats": [
      {"result": "K", "firstPitchStrike": true},
      {"result": "1-3", "firstPitchStrike": false},
      {"result": "6H", "firstPitchStrike": true}
    ]
  },
  {
    "battingOrder": 2,
    "name": "金锭裕",
    "number": "53",
    "atBats": [
      {"result": "BB", "firstPitchStrike": false},
      {"result": "4-3", "firstPitchStrike": true}
    ]
  }
]

说明：
- battingOrder: 打击顺序 1-9
- name: 球员中文姓名
- number: 背号（数字字符串）
- atBats: 打席数组，每个打席包含：
  - result: 打击结果文字（从表格中读取）
  - firstPitchStrike: 首球好球为 true，首球坏球为 false
- 如果某个打席的首球好坏球无法判断，默认为 false
- 如果某个位置没有球员信息就跳过
- 如果打席为空就返回空数组 []`,
            },
          ],
        },
      ],
    });

    const text = (response.content[0] as { type: string; text: string }).text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ players: [] });
    const players = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ players });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
