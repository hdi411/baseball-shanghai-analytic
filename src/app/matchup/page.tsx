"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTeams } from "@/lib/store";
import type { Team, Player } from "@/lib/types";
import { isHitResult, trueAtBats } from "@/components/PlayerCharts";

const LINEUP_SIZE = 9;

function zoneLabel(idx: number): string {
  const row = Math.floor(idx / 5);
  const col = idx % 5;
  const rowWords = ["高", "偏高", "中间", "偏低", "低"];
  const colWords = ["外角", "偏外", "中间", "偏内", "内角"];
  return `${rowWords[row]}${colWords[col]}`;
}

function battingInsights(player: Player) {
  const atBats = player.gameStats.flatMap((g) => g.atBats);
  const pa = atBats.length;
  const trueAB = trueAtBats(atBats);
  const hits = atBats.filter((ab) => ["1B", "2B", "3B", "HR"].includes(ab.result)).length;
  const avg = trueAB > 0 ? hits / trueAB : 0;
  const k = atBats.filter((ab) => ab.result === "K").length;
  const bb = atBats.filter((ab) => ["BB", "IBB"].includes(ab.result)).length;
  const kRate = pa > 0 ? k / pa : 0;
  const bbRate = pa > 0 ? bb / pa : 0;
  const fps = atBats.filter((ab) => ab.firstPitchStrike).length;
  const fpsRate = pa > 0 ? fps / pa : 0;

  const zoneHits = Array(25).fill(0);
  const zoneTotal = Array(25).fill(0);
  for (const ab of atBats) {
    if (ab.pitchZone !== undefined && ab.pitchZone >= 0 && ab.pitchZone < 25) {
      zoneTotal[ab.pitchZone]++;
      if (isHitResult(ab.result)) zoneHits[ab.pitchZone]++;
    }
  }
  const hotZones = zoneTotal
    .map((t, i) => ({ i, t, hits: zoneHits[i], rate: t > 0 ? zoneHits[i] / t : 0 }))
    .filter((z) => z.t >= 2 && z.rate > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 2);

  const bullets: string[] = [];
  if (pa >= 5) {
    if (avg >= 0.3 && trueAB >= 10) bullets.push(`打击率 ${avg.toFixed(3)}，需重点警惕`);
    else if (avg > 0 && avg < 0.2 && trueAB >= 10) bullets.push(`打击率偏低 (${avg.toFixed(3)})，可正面对决`);
    if (kRate >= 0.3) bullets.push(`三振率 ${Math.round(kRate * 100)}%，可考虑用变化球追打`);
    if (bbRate >= 0.15) bullets.push(`保送率 ${Math.round(bbRate * 100)}%，选球耐心，避免多丢坏球`);
    if (fpsRate < 0.4) bullets.push(`首球好球率仅 ${Math.round(fpsRate * 100)}%，容易在首球投出坏球`);
  }
  for (const z of hotZones) {
    bullets.push(`${zoneLabel(z.i)} 安打率 ${Math.round(z.rate * 100)}%（${z.hits}/${z.t}），避免投到这个位置`);
  }

  return { pa, trueAB, hits, avg, k, bb, kRate, bbRate, fpsRate, bullets };
}

function pitchingInsights(player: Player) {
  const totals = Array(25).fill(0);
  let grand = 0;
  for (const s of player.pitchLocationStats) {
    for (let i = 0; i < 25; i++) totals[i] += s.zoneCounts[i] ?? 0;
    grand += s.zoneCounts.reduce((a, b) => a + b, 0);
  }
  const top = totals
    .map((c, i) => ({ i, c }))
    .filter((z) => z.c > 0)
    .sort((a, b) => b.c - a.c)
    .slice(0, 2);
  const bullets: string[] = [];
  if (grand >= 10) {
    for (const t of top) bullets.push(`常投 ${zoneLabel(t.i)}（占比 ${Math.round((t.c / grand) * 100)}%）`);
  }
  return { grand, bullets };
}

function LineupPanel({
  team, teams, onTeamChange, lineup, onLineupChange, pitcherId, onPitcherChange,
}: {
  team: Team | null;
  teams: Team[];
  onTeamChange: (id: string) => void;
  lineup: string[];
  onLineupChange: (i: number, playerId: string) => void;
  pitcherId: string;
  onPitcherChange: (playerId: string) => void;
}) {
  const players = team?.players ?? [];
  const sorted = [...players].sort((a, b) => Number(a.number) - Number(b.number));

  return (
    <div className="card p-5">
      <select
        className="input mb-4 font-semibold"
        value={team?.id ?? ""}
        onChange={(e) => onTeamChange(e.target.value)}
      >
        <option value="">选择球队...</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      {team && (
        <>
          <div className="text-xs mb-2" style={{ color: "#64748b" }}>先发投手</div>
          <select
            className="input mb-4"
            value={pitcherId}
            onChange={(e) => onPitcherChange(e.target.value)}
          >
            <option value="">未选择</option>
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>#{p.number} {p.name || "?"} ({p.position})</option>
            ))}
          </select>

          <div className="text-xs mb-2" style={{ color: "#64748b" }}>先发打线（1-9棒）</div>
          <div className="space-y-2">
            {Array.from({ length: LINEUP_SIZE }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-xs text-right" style={{ color: "#64748b" }}>{i + 1}</span>
                <select
                  className="input"
                  value={lineup[i] ?? ""}
                  onChange={(e) => onLineupChange(i, e.target.value)}
                >
                  <option value="">未选择</option>
                  {sorted.map((p) => (
                    <option key={p.id} value={p.id}>#{p.number} {p.name || "?"} ({p.position})</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AnalysisPanel({ team, lineup, pitcherId }: { team: Team | null; lineup: string[]; pitcherId: string }) {
  if (!team) return null;
  const byId = new Map(team.players.map((p) => [p.id, p]));
  const pitcher = pitcherId ? byId.get(pitcherId) : undefined;
  const lineupPlayers = lineup.map((id) => (id ? byId.get(id) : undefined)).filter(Boolean) as Player[];

  if (!pitcher && lineupPlayers.length === 0) return null;

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-white mb-4">{team.name} — 注意事项</h3>

      {pitcher && (
        <div className="mb-5 pb-4" style={{ borderBottom: "1px solid #334155" }}>
          <div className="text-sm font-medium text-white mb-1">
            投手 #{pitcher.number} {pitcher.name || "?"}
          </div>
          {(() => {
            const { grand, bullets } = pitchingInsights(pitcher);
            if (grand === 0) return <div className="text-xs" style={{ color: "#64748b" }}>暂无投球位置数据</div>;
            return bullets.length > 0 ? (
              <ul className="text-xs space-y-1 mt-1" style={{ color: "#94a3b8" }}>
                {bullets.map((b, i) => <li key={i}>• {b}</li>)}
              </ul>
            ) : <div className="text-xs" style={{ color: "#64748b" }}>样本量较少，暂无明显倾向</div>;
          })()}
        </div>
      )}

      {lineupPlayers.length > 0 && (
        <div className="space-y-3">
          {lineupPlayers.map((p, i) => {
            const stats = battingInsights(p);
            return (
              <div key={p.id} className="text-sm">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium text-white">#{p.number} {p.name || "?"}</span>
                  <span className="text-xs" style={{ color: "#64748b" }}>
                    {stats.trueAB > 0 ? `${stats.avg.toFixed(3)} (${stats.hits}/${stats.trueAB})` : "暂无数据"}
                    {stats.pa > 0 && ` · K${stats.k} BB${stats.bb} · 首球好球${Math.round(stats.fpsRate * 100)}%`}
                  </span>
                </div>
                {stats.bullets.length > 0 && (
                  <ul className="text-xs mt-0.5 space-y-0.5" style={{ color: "#94a3b8" }}>
                    {stats.bullets.map((b, j) => <li key={j}>• {b}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MatchupPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [lineupA, setLineupA] = useState<string[]>(Array(LINEUP_SIZE).fill(""));
  const [lineupB, setLineupB] = useState<string[]>(Array(LINEUP_SIZE).fill(""));
  const [pitcherA, setPitcherA] = useState("");
  const [pitcherB, setPitcherB] = useState("");

  useEffect(() => {
    getTeams().then((t) => {
      setTeams(t);
      setLoading(false);
      const home = t.find((x) => x.name.includes("上海") || (x.shortName ?? "").includes("上海"));
      if (home) setTeamAId(home.id);
    });
  }, []);

  const teamA = teams.find((t) => t.id === teamAId) ?? null;
  const teamB = teams.find((t) => t.id === teamBId) ?? null;

  function setLineupSlot(side: "A" | "B", i: number, playerId: string) {
    const setter = side === "A" ? setLineupA : setLineupB;
    setter((prev) => {
      const next = [...prev];
      next[i] = playerId;
      return next;
    });
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>;
  }

  return (
    <div className="min-h-screen">
      <nav style={{ background: "#1e293b", borderBottom: "1px solid #334155" }} className="sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="btn btn-ghost text-sm px-3">← 返回</Link>
          <span className="font-semibold text-white">对阵分析 Matchup</span>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-sm mb-6" style={{ color: "#64748b" }}>
          选择双方先发投手和打线，下方会自动列出对方球员的历史数据倾向。
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          <LineupPanel
            team={teamA} teams={teams}
            onTeamChange={(id) => { setTeamAId(id); setLineupA(Array(LINEUP_SIZE).fill("")); setPitcherA(""); }}
            lineup={lineupA} onLineupChange={(i, id) => setLineupSlot("A", i, id)}
            pitcherId={pitcherA} onPitcherChange={setPitcherA}
          />
          <LineupPanel
            team={teamB} teams={teams}
            onTeamChange={(id) => { setTeamBId(id); setLineupB(Array(LINEUP_SIZE).fill("")); setPitcherB(""); }}
            lineup={lineupB} onLineupChange={(i, id) => setLineupSlot("B", i, id)}
            pitcherId={pitcherB} onPitcherChange={setPitcherB}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <AnalysisPanel team={teamA} lineup={lineupA} pitcherId={pitcherA} />
          <AnalysisPanel team={teamB} lineup={lineupB} pitcherId={pitcherB} />
        </div>
      </div>
    </div>
  );
}
