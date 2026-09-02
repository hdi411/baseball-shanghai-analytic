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
      max_tokens: 1024,
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
              text: `这是一张棒球打击顺序记录表（Pitcher Location & First Pitch Strike Chart）。
请从左侧每个打击顺序（1-9）中提取球员姓名和背号。
每个打击位置左侧会有：手写的姓名（中文）和数字背号。

请以 JSON 格式返回，只返回 JSON，不要其他文字：
[
  {"battingOrder": 1, "name": "张友极", "number": "23"},
  {"battingOrder": 2, "name": "金锭裕", "number": "53"},
  ...
]

如果某个位置没有球员信息就跳过。`,
            },
          ],
        },
      ],
    });

    const text = (response.content[0] as { type: string; text: string }).text;
    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ players: [] });
    const players = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ players });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
