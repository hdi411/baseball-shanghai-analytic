"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getTeam, deleteChart, deleteGameStat } from "@/lib/store";
import { getFile } from "@/lib/db";
import type { Team, Player, ChartFile, ChartCategory, GameStat } from "@/lib/types";
import { CHART_TYPE_LABELS, CHART_TYPE_EN, CHART_CATEGORY } from "@/lib/types";

type Tab = "batting" | "pitching" | "scouting" | "stats";

const TAB_LABELS: Record<Tab, string> = {
  batting: "打击图表",
  pitching: "投球图表",
  scouting: "球探图表",
  stats: "打席数据",
};

export default function PlayerPage() {
  const params = useParams<{ id: string; playerId: string }>();
  const [team, setTeam] = useState<Team | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [tab, setTab] = useState<Tab>("batting");
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});
  const [viewingChart, setViewingChart] = useState<ChartFile | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const t = await getTeam(params.id);
    setTeam(t);
    const p = t?.players.find((p) => p.id === params.playerId) ?? null;
    setPlayer(p);
  }, [params.id, params.playerId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!player) return;
    const visible = player.charts.filter((c) => (CHART_CATEGORY[c.type] as ChartCategory) === tab);
    visible.forEach(async (c) => {
      if (!pdfUrls[c.id]) {
        const url = await getFile(c.id);
        if (url) setPdfUrls((prev) => ({ ...prev, [c.id]: url }));
      }
    });
  }, [player, tab, pdfUrls]);

  async function handleView(chart: ChartFile) {
    setViewingChart(chart);
    const url = pdfUrls[chart.id] ?? await getFile(chart.id);
    setViewUrl(url);
  }

  async function handleDelete(chartId: string) {
    if (!confirm("删除这张图表？")) return;
    await deleteChart(params.id, params.playerId, chartId);
    setViewingChart(null);
    setViewUrl(null);
    await reload();
  }

  async function handleDeleteStat(statId: string) {
    if (!confirm("删除这条打席记录？")) return;
    await deleteGameStat(params.id, params.playerId, statId);
    await reload();
  }

  if (!team || !player) return null;

  const chartsForTab = player.charts.filter((c) => (CHART_CATEGORY[c.type] as ChartCategory) === tab);
  const gameStats: GameStat[] = player.gameStats ?? [];
  const allAtBats = gameStats.flatMap(g => g.atBats);
  const totalAtBats = allAtBats.length;
  const fpsCount = allAtBats.filter(a => a.firstPitchStrike).length;
  const fpsPct = totalAtBats > 0 ? Math.round((fpsCount / totalAtBats) * 100) : null;

  return (
    <div className="min-h-screen">
      <nav style={{ background: "#1e293b", borderBottom: "1px solid #334155" }} className="sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/teams/${team.id}`} className="btn btn-ghost text-sm px-3">← 返回</Link>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs text-white"
                style={{ background: team.color ?? "#22c55e" }}>
                {team.shortName ?? team.name.slice(0,2)}
              </div>
              <span className="text-sm" style={{ color: "#64748b" }}>{team.name}</span>
              <span style={{ color: "#334155" }}>/</span>
              <span className="font-semibold text-white">{player.name || `#${player.number}`}</span>
            </div>
          </div>
          <Link href={`/upload?teamId=${team.id}&playerId=${player.id}`} className="btn btn-primary text-sm">
            + 上传图表
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="card p-6 mb-6 flex flex-wrap gap-6 items-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ background: team.color ?? "#22c55e" }}>
            #{player.number}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{player.name || `#${player.number}`}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="badge text-white" style={{ background: "#334155" }}>{player.position}</span>
              {player.bats && <span className="text-sm" style={{ color: "#64748b" }}>打击：{player.bats === "R" ? "右打" : player.bats === "L" ? "左打" : "两打"}</span>}
              {player.throws && <span className="text-sm" style={{ color: "#64748b" }}>投球：{player.throws === "R" ? "右投" : "左投"}</span>}
            </div>
          </div>
          <div className="ml-auto flex gap-6">
            {(["batting","pitching","scouting"] as Tab[]).map((cat) => (
              <div key={cat} className="text-center">
                <div className="text-xl font-bold text-white">
                  {player.charts.filter(c => (CHART_CATEGORY[c.type] as ChartCategory) === cat).length}
                </div>
                <div className="text-xs" style={{ color: "#64748b" }}>{TAB_LABELS[cat]}</div>
              </div>
            ))}
            <div className="text-center">
              <div className="text-xl font-bold text-white">{gameStats.length}</div>
              <div className="text-xs" style={{ color: "#64748b" }}>打席场次</div>
            </div>
            {fpsPct !== null && (
              <div className="text-center">
                <div className="text-xl font-bold text-green-400">{fpsPct}%</div>
                <div className="text-xs" style={{ color: "#64748b" }}>首球好球率</div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-6 p-1 rounded-lg" style={{ background: "#1e293b", border: "1px solid #334155", width: "fit-content" }}>
          {(["batting","pitching","scouting","stats"] as Tab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
              {t !== "stats" && (
                <span className="ml-1 text-xs opacity-70">
                  ({player.charts.filter(c => (CHART_CATEGORY[c.type] as ChartCategory) === t).length})
                </span>
              )}
              {t === "stats" && <span className="ml-1 text-xs opacity-70">({gameStats.length})</span>}
            </button>
          ))}
        </div>

        {tab !== "stats" && (
          chartsForTab.length === 0 ? (
            <div className="text-center py-16" style={{ color: "#64748b" }}>
              <div className="text-5xl mb-3">📄</div>
              <p className="text-lg mb-1">暂无{TAB_LABELS[tab]}</p>
              <p className="text-sm mb-4">点击右上角「上传图表」新增</p>
              <Link href={`/upload?teamId=${team.id}&playerId=${player.id}`} className="btn btn-primary inline-flex">
                上传图表
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {chartsForTab.map((chart) => (
                <div key={chart.id} className="card overflow-hidden group cursor-pointer" onClick={() => handleView(chart)}>
                  <div className="h-40 relative" style={{ background: "#0f172a" }}>
                    {pdfUrls[chart.id] ? (
                      <iframe src={pdfUrls[chart.id]} className="w-full h-full border-0 pointer-events-none" title={chart.fileName} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl" style={{ color: "#334155" }}>📋</div>
                    )}
                    <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 transition-opacity" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="bg-white text-black text-sm font-medium px-3 py-1 rounded-full">查看</span>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-xs font-medium text-white mb-1 truncate">{CHART_TYPE_LABELS[chart.type]}</div>
                    <div className="text-xs truncate" style={{ color: "#64748b" }}>
                      {chart.opponent && <span>{chart.opponent} · </span>}
                      {chart.gameDate && <span>{chart.gameDate} · </span>}
                      {new Date(chart.uploadedAt).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "stats" && (
          gameStats.length === 0 ? (
            <div className="text-center py-16" style={{ color: "#64748b" }}>
              <div className="text-5xl mb-3">📊</div>
              <p className="text-lg mb-1">暂无打席数据</p>
              <p className="text-sm">通过「🤖 智能导入」上传记录表 PDF 可自动提取打席数据</p>
            </div>
          ) : (
            <>
              <div className="card p-5 mb-6">
                <h3 className="font-semibold text-white mb-4">首球好球统计</h3>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 rounded-lg" style={{ background: "#0f172a" }}>
                    <div className="text-2xl font-bold text-white">{totalAtBats}</div>
                    <div className="text-xs mt-1" style={{ color: "#64748b" }}>总打席数</div>
                  </div>
                  <div className="text-center p-3 rounded-lg" style={{ background: "#0f172a" }}>
                    <div className="text-2xl font-bold text-green-400">{fpsCount}</div>
                    <div className="text-xs mt-1" style={{ color: "#64748b" }}>首球好球</div>
                  </div>
                  <div className="text-center p-3 rounded-lg" style={{ background: "#0f172a" }}>
                    <div className="text-2xl font-bold text-blue-400">{fpsPct}%</div>
                    <div className="text-xs mt-1" style={{ color: "#64748b" }}>好球率</div>
                  </div>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: "#1e293b" }}>
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${fpsPct ?? 0}%` }} />
                </div>
                <div className="flex justify-between text-xs mt-1" style={{ color: "#64748b" }}>
                  <span>坏球 {totalAtBats - fpsCount} 次</span>
                  <span>好球 {fpsCount} 次</span>
                </div>
              </div>
              <div className="space-y-4">
                {[...gameStats].reverse().map((stat) => {
                  const gameFps = stat.atBats.filter(a => a.firstPitchStrike).length;
                  const gamePct = stat.atBats.length > 0 ? Math.round((gameFps / stat.atBats.length) * 100) : 0;
                  return (
                    <div key={stat.id} className="card p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-medium text-white">
                            {stat.opponent ? `vs ${stat.opponent}` : "比赛记录"}
                            <span className="ml-2 text-xs" style={{ color: "#64748b" }}>{stat.battingOrder}棒</span>
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                            {stat.gameDate || new Date(stat.uploadedAt).toLocaleDateString("zh-CN")}
                            {" · "}{stat.atBats.length} 打席 · 首球好球率 {gamePct}%
                          </div>
                        </div>
                        <button onClick={() => handleDeleteStat(stat.id)}
                          className="text-red-400 hover:text-red-300 text-sm opacity-60 hover:opacity-100">🗑</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {stat.atBats.map((ab, i) => (
                          <div key={i} className="flex flex-col items-center gap-1">
                            <div className="px-2 py-1 rounded text-xs font-mono text-white"
                              style={{ background: "#1e293b", border: "1px solid #334155", minWidth: 36, textAlign: "center" }}>
                              {ab.result || "—"}
                            </div>
                            <div className={`w-2 h-2 rounded-full ${ab.firstPitchStrike ? "bg-green-500" : "bg-red-500"}`}
                              title={ab.firstPitchStrike ? "首球好球" : "首球坏球"} />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )
        )}
      </div>

      {viewingChart && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.95)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "#1e293b", borderBottom: "1px solid #334155" }}>
            <div>
              <div className="font-semibold text-white text-sm">{CHART_TYPE_LABELS[viewingChart.type]}</div>
              <div className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                {CHART_TYPE_EN[viewingChart.type]} · {viewingChart.fileName}
                {viewingChart.opponent && ` · vs ${viewingChart.opponent}`}
                {viewingChart.gameDate && ` · ${viewingChart.gameDate}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn btn-danger text-sm" onClick={() => handleDelete(viewingChart.id)}>🗑 删除</button>
              <button className="btn btn-ghost text-sm" onClick={() => { setViewingChart(null); setViewUrl(null); }}>✕ 关闭</button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {viewUrl ? (
              <iframe src={viewUrl} className="w-full h-full border-0" title="PDF viewer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ color: "#64748b" }}>载入中...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
