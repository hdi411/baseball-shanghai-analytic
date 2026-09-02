"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { getTeam } from "@/lib/store";
import type { Team } from "@/lib/types";

const POSITION_COLORS: Record<string, string> = {
  P: "#3b82f6", C: "#8b5cf6", "1B": "#f59e0b", "2B": "#f59e0b",
  "3B": "#f59e0b", SS: "#f59e0b", LF: "#22c55e", CF: "#22c55e",
  RF: "#22c55e", DH: "#ef4444", OF: "#22c55e", INF: "#f59e0b",
};

export default function TeamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getTeam(params.id).then((t) => {
      setTeam(t);
      if (!t) router.push("/");
    });
  }, [params.id]);

  if (!team) return null;

  const filtered = team.players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.number.includes(search) ||
    p.position.toLowerCase().includes(search.toLowerCase())
  );

  const totalCharts = team.players.reduce((s, p) => s + p.charts.length, 0);
  const totalStats  = team.players.reduce((s, p) => s + (p.gameStats?.length ?? 0), 0);
  const totalPls    = team.players.reduce((s, p) => s + (p.pitchLocationStats?.length ?? 0), 0);

  return (
    <div className="min-h-screen">
      <nav style={{ background: "#1e293b", borderBottom: "1px solid #334155" }} className="sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="btn btn-ghost text-sm px-3">← 返回</Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white"
              style={{ background: team.color ?? "#22c55e" }}>
              {team.shortName ?? team.name.slice(0, 2)}
            </div>
            <span className="font-semibold text-white">{team.name}</span>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "球员人数", value: team.players.length },
            { label: "投手", value: team.players.filter(p => p.position === "P").length },
            { label: "已上传图表", value: totalCharts },
            { label: "打席记录", value: totalStats + totalPls },
          ].map((s) => (
            <div key={s.label} className="card p-4 text-center">
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs mt-1" style={{ color: "#64748b" }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mb-6">
          <input className="input" style={{ maxWidth: 400 }}
            placeholder="🔍  搜索球员姓名、背号、守备位置..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16" style={{ color: "#64748b" }}>
            {team.players.length === 0
              ? <><div className="text-5xl mb-3">👤</div><p className="text-lg">暂无球员数据</p></>
              : <p>没有符合「{search}」的球员</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((player) => {
              const allAtBats = player.gameStats?.flatMap(g => g.atBats) ?? [];
              const fpsPct = allAtBats.length > 0
                ? Math.round((allAtBats.filter(a => a.firstPitchStrike).length / allAtBats.length) * 100)
                : null;
              const plsTotal = (player.pitchLocationStats ?? []).reduce(
                (s, r) => s + r.zoneCounts.reduce((a, b) => a + b, 0), 0
              );
              return (
                <Link key={player.id} href={`/teams/${team.id}/${player.id}`} className="block">
                  <div className="card p-4 hover:border-green-500 transition-all cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm"
                        style={{ background: POSITION_COLORS[player.position] ?? "#64748b" }}>
                        #{player.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white truncate">{player.name || `#${player.number}`}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="badge text-white text-xs" style={{ background: POSITION_COLORS[player.position] ?? "#64748b" }}>{player.position}</span>
                          {player.bats && <span className="text-xs" style={{ color: "#64748b" }}>打:{player.bats}</span>}
                          {player.throws && <span className="text-xs" style={{ color: "#64748b" }}>投:{player.throws}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: "#64748b" }}>
                      <span>{player.charts.length > 0 ? `${player.charts.length} 图表` : "暂无图表"}</span>
                      {allAtBats.length > 0 && (
                        <span style={{ color: "#94a3b8" }}>
                          {player.gameStats?.length} 场
                          {fpsPct !== null && <span className="ml-1 text-green-400">首球 {fpsPct}%</span>}
                        </span>
                      )}
                      {plsTotal > 0 && <span style={{ color: "#94a3b8" }}>{plsTotal}球位置</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
