"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Team, Player, ChartFile, ChartCategory, GameStat, AtBat, PitchLocationStat, CHART_CATEGORY, CHART_TYPE_LABELS } from "@/lib/types";
import { getTeam } from "@/lib/store";
import { getFile } from "@/lib/db";

// ── Pitch zone heat-map from Supabase pitch_location_stats ──────────────────
function PitchZoneHeatMap({ stats }: { stats: PitchLocationStat[] }) {
  if (stats.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">暂无投球位置数据</div>
    );
  }

  // Aggregate all zone counts
  const totals = Array(25).fill(0);
  let grandTotal = 0;
  for (const s of stats) {
    for (let i = 0; i < 25; i++) {
      totals[i] += s.zoneCounts[i] ?? 0;
    }
    grandTotal += s.zoneCounts.reduce((a, b) => a + b, 0);
  }

  const maxCount = Math.max(...totals, 1);

  const colLabels = ["外", "", "", "", "内"];
  const rowLabels = ["高", "", "", "", "低"];

  return (
    <div>
      <div className="flex items-start gap-4">
        {/* Row labels */}
        <div className="flex flex-col justify-around" style={{ height: 250 }}>
          {rowLabels.map((l, i) => (
            <span key={i} className="text-xs text-gray-400 w-4 text-right">{l}</span>
          ))}
        </div>
        {/* Grid */}
        <div>
          <div
            className="grid border border-gray-600"
            style={{ gridTemplateColumns: "repeat(5, 50px)", gridTemplateRows: "repeat(5, 50px)" }}
          >
            {totals.map((count, idx) => {
              const prob = grandTotal > 0 ? count / grandTotal : 0;
              const intensity = count / maxCount;
              const bg = `rgba(34,197,94,${Math.max(0.05, intensity)})`;
              return (
                <div
                  key={idx}
                  style={{ backgroundColor: bg }}
                  className="border border-gray-700 flex flex-col items-center justify-center"
                >
                  <span className="text-white text-xs font-bold">{count}</span>
                  <span className="text-gray-300 text-[10px]">
                    {grandTotal > 0 ? (prob * 100).toFixed(1) + "%" : "0%"}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Col labels */}
          <div className="flex mt-1" style={{ width: 250 }}>
            {colLabels.map((l, i) => (
              <span key={i} className="text-xs text-gray-400 text-center" style={{ width: 50 }}>{l}</span>
            ))}
          </div>
          <div className="text-center text-xs text-gray-500 mt-1">← 外角　　　　内角 →（投手视角）</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-500">
        总投球数：{grandTotal}　来源场次：{stats.length}
      </div>
    </div>
  );
}

// ── Per-at-bat pitch zone heat-map from AI-extracted pitchZone ───────────────
function PitchHeatMap({ gameStats }: { gameStats: GameStat[] }) {
  const counts = Array(25).fill(0);
  let total = 0;
  for (const gs of gameStats) {
    for (const ab of gs.atBats) {
      if (ab.pitchZone !== undefined && ab.pitchZone >= 0 && ab.pitchZone < 25) {
        counts[ab.pitchZone]++;
        total++;
      }
    }
  }

  if (total === 0) {
    return (
      <div className="text-center text-gray-400 py-4 text-sm">
        暂无首球位置数据（需PDF中含投球区域信息）
      </div>
    );
  }

  const maxCount = Math.max(...counts, 1);
  const colLabels = ["外", "", "", "", "内"];
  const rowLabels = ["高", "", "", "", "低"];

  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="flex flex-col justify-around" style={{ height: 250 }}>
          {rowLabels.map((l, i) => (
            <span key={i} className="text-xs text-gray-400 w-4 text-right">{l}</span>
          ))}
        </div>
        <div>
          <div
            className="grid border border-gray-600"
            style={{ gridTemplateColumns: "repeat(5, 50px)", gridTemplateRows: "repeat(5, 50px)" }}
          >
            {counts.map((count, idx) => {
              const prob = total > 0 ? count / total : 0;
              const intensity = count / maxCount;
              const bg = `rgba(59,130,246,${Math.max(0.05, intensity)})`;
              return (
                <div
                  key={idx}
                  style={{ backgroundColor: bg }}
                  className="border border-gray-700 flex flex-col items-center justify-center"
                >
                  <span className="text-white text-xs font-bold">{count}</span>
                  <span className="text-gray-300 text-[10px]">
                    {total > 0 ? (prob * 100).toFixed(1) + "%" : "0%"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex mt-1" style={{ width: 250 }}>
            {colLabels.map((l, i) => (
              <span key={i} className="text-xs text-gray-400 text-center" style={{ width: 50 }}>{l}</span>
            ))}
          </div>
          <div className="text-center text-xs text-gray-500 mt-1">← 外角　　　　内角 →（投手视角）</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-500">首球总数：{total}</div>
    </div>
  );
}

// ── Category label helper ────────────────────────────────────────────────────
function categoryLabel(cat: ChartCategory): string {
  const map: Record<string, string> = {
    batting: "打击",
    pitching: "投球",
    scouting: "数据分析",
  };
  return map[cat] ?? cat;
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;
  const playerId = params.playerId as string;

  const [team, setTeam] = useState<Team | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"stats" | "charts">("stats");
  const [selectedChart, setSelectedChart] = useState<ChartFile | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const t = await getTeam(teamId);
        setTeam(t);
        const p = t?.players.find((pl) => pl.id === playerId) ?? null;
        setPlayer(p);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [teamId, playerId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">加载中...</div>
      </div>
    );
  }

  if (!team || !player) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">未找到球员</div>
      </div>
    );
  }

  // ── Aggregate stats ──────────────────────────────────────────────────────
  const allAtBats: AtBat[] = player.gameStats.flatMap((gs) => gs.atBats);
  const totalAB = allAtBats.length;
  const hits = allAtBats.filter((ab) =>
    ["1B", "2B", "3B", "HR"].includes(ab.result)
  ).length;
  const avg = totalAB > 0 ? (hits / totalAB).toFixed(3) : ".000";
  const firstPitchStrikes = allAtBats.filter((ab) => ab.firstPitchStrike).length;
  const fpsRate =
    totalAB > 0 ? ((firstPitchStrikes / totalAB) * 100).toFixed(1) : "0.0";

  // At-bat result breakdown
  const resultCounts: Record<string, number> = {};
  for (const ab of allAtBats) {
    resultCounts[ab.result] = (resultCounts[ab.result] ?? 0) + 1;
  }

  // Charts grouped by category
  const chartsByCategory: Partial<Record<ChartCategory, ChartFile[]>> = {};
  for (const chart of player.charts) {
    const cat = CHART_CATEGORY[chart.type];
    if (!chartsByCategory[cat]) chartsByCategory[cat] = [];
    chartsByCategory[cat]!.push(chart);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push(`/teams/${teamId}`)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← {team.name}
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium">
            #{player.number}
            {player.name ? ` ${player.name}` : ""}
          </span>
          <div className="ml-auto flex gap-2 text-sm text-gray-400">
            {player.throws && <span>投：{player.throws}</span>}
            {player.bats && <span>打：{player.bats}</span>}
            <span>{player.position}</span>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* ── Summary cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "打席", value: totalAB },
            { label: "安打", value: hits },
            { label: "打击率", value: avg },
            { label: "首球好球率", value: `${fpsRate}%` },
          ].map((c) => (
            <div key={c.label} className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{c.value}</div>
              <div className="text-sm text-gray-400 mt-1">{c.label}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1 w-fit">
          {(["stats", "charts"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-green-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "stats" ? "打击数据" : "图表"}
            </button>
          ))}
        </div>

        {/* ── Stats tab ─────────────────────────────────────────────────── */}
        {activeTab === "stats" && (
          <div className="space-y-6">
            {/* Per-game breakdown */}
            {player.gameStats.length > 0 ? (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-700 text-gray-300">
                      <th className="px-4 py-3 text-left">日期</th>
                      <th className="px-4 py-3 text-left">对手</th>
                      <th className="px-4 py-3 text-center">打席</th>
                      <th className="px-4 py-3 text-center">安打</th>
                      <th className="px-4 py-3 text-left">结果详情</th>
                    </tr>
                  </thead>
                  <tbody>
                    {player.gameStats.map((gs) => {
                      const ab = gs.atBats.length;
                      const h = gs.atBats.filter((a) =>
                        ["1B", "2B", "3B", "HR"].includes(a.result)
                      ).length;
                      return (
                        <tr
                          key={gs.id}
                          className="border-t border-gray-700 hover:bg-gray-750"
                        >
                          <td className="px-4 py-3 text-gray-300">{gs.gameDate ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-300">{gs.opponent ?? "—"}</td>
                          <td className="px-4 py-3 text-center">{ab}</td>
                          <td className="px-4 py-3 text-center">{h}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {gs.atBats.map((a, i) => (
                                <span
                                  key={i}
                                  className={`px-2 py-0.5 rounded text-xs ${
                                    ["1B", "2B", "3B", "HR"].includes(a.result)
                                      ? "bg-green-800 text-green-200"
                                      : "bg-gray-700 text-gray-300"
                                  }`}
                                >
                                  {a.result}
                                  {a.pitchZone !== undefined
                                    ? ` Z${Math.floor(a.pitchZone / 5)}-${a.pitchZone % 5}`
                                    : ""}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-12">暂无打击数据</div>
            )}

            {/* Result breakdown */}
            {Object.keys(resultCounts).length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">结果分布</h3>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(resultCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([result, count]) => (
                      <div
                        key={result}
                        className="bg-gray-700 rounded-lg px-4 py-3 text-center min-w-[80px]"
                      >
                        <div className="text-xl font-bold text-green-400">{count}</div>
                        <div className="text-sm text-gray-400">{result}</div>
                        <div className="text-xs text-gray-500">
                          {totalAB > 0 ? ((count / totalAB) * 100).toFixed(1) : 0}%
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Faced pitches heatmap from Supabase */}
            {player.pitchLocationStats.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2">面对来球位置 <span className="text-sm font-normal text-gray-400">Faced Pitches</span></h3>
                <PitchZoneHeatMap stats={player.pitchLocationStats} />
              </div>
            )}

            {/* First-pitch heat map (from AI-extracted pitchZone) */}
            {player.gameStats.some((gs) =>
              gs.atBats.some((ab) => ab.pitchZone !== undefined)
            ) && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">首球位置热图</h3>
                <PitchHeatMap gameStats={player.gameStats} />
              </div>
            )}
          </div>
        )}

        {/* ── Charts tab ────────────────────────────────────────────────── */}
        {activeTab === "charts" && (
          <div>
            {player.charts.length === 0 ? (
              <div className="text-center text-gray-400 py-12">暂无图表</div>
            ) : (
              Object.entries(chartsByCategory).map(([cat, charts]) => (
                <div key={cat} className="mb-8">
                  <h3 className="text-lg font-semibold mb-3 text-gray-300">
                    {categoryLabel(cat as ChartCategory)}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {charts!.map((chart) => (
                      <div
                        key={chart.id}
                        className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition-colors"
                        onClick={async () => {
                          setSelectedChart(chart);
                          const url = await getFile(chart.id);
                          setPdfUrl(url);
                        }}
                      >
                        <div className="text-sm font-medium truncate">{CHART_TYPE_LABELS[chart.type]}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {chart.uploadedAt
                            ? new Date(chart.uploadedAt).toLocaleDateString("zh-CN")
                            : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}


      </div>

      {/* ── PDF overlay ───────────────────────────────────────────────────── */}
      {selectedChart && pdfUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-4xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <span className="font-medium">{CHART_TYPE_LABELS[selectedChart.type]}</span>
              <button
                onClick={() => {
                  setSelectedChart(null);
                  setPdfUrl(null);
                }}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <iframe
              src={pdfUrl}
              className="flex-1 rounded-b-xl"
              title={CHART_TYPE_LABELS[selectedChart.type]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
