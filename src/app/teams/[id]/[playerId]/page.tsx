"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Team, Player, ChartFile, ChartCategory,
  GameStat, AtBat, PitchLocationStat,
  CHART_CATEGORY, CHART_TYPE_LABELS, positionLabel,
} from "@/lib/types";
import { getTeam } from "@/lib/store";
import { bilingualName } from "@/lib/englishNames";
import { getFile } from "@/lib/db";
import { PitchZoneHeatMap, FirstPitchStrikeGauge, HitZoneHeatMap, PerspectiveToggle, BatsFilterToggle, filterByBats, isHitResult, trueAtBats } from "@/components/PlayerCharts";

// ── Spray Chart ──────────────────────────────────────────────────────────────
const FIELD_POS: Record<number, [number, number]> = {
  1: [160, 200], // P
  2: [160, 288], // C
  3: [235, 215], // 1B
  4: [188, 158], // 2B
  5: [85,  215], // 3B
  6: [122, 163], // SS
  7: [52,  75],  // LF
  8: [160, 38],  // CF
  9: [268, 75],  // RF
};

function extractFielder(result: string): number | null {
  if (["1B", "2B", "3B", "HR"].includes(result)) return null;
  if (/^(K|BB|IBB|HBP|>)/.test(result)) return null;
  const m = result.match(/^(\d)/);
  if (m) return parseInt(m[1]);
  return null;
}

function SprayChart({ allAtBats }: { allAtBats: AtBat[] }) {
  const dots = allAtBats
    .map((ab, i) => {
      const fielder = extractFielder(ab.result);
      if (!fielder || !FIELD_POS[fielder]) return null;
      const [bx, by] = FIELD_POS[fielder];
      const angle = (i * 137.508) * (Math.PI / 180);
      const radius = Math.sqrt(i % 9) * 6;
      return {
        x: bx + Math.cos(angle) * radius,
        y: by + Math.sin(angle) * radius,
        hit: isHitResult(ab.result),
        result: ab.result,
      };
    })
    .filter(Boolean) as { x: number; y: number; hit: boolean; result: string }[];

  return (
    <div>
      <svg width="320" height="300" viewBox="0 0 320 300"
        style={{ background: "#0f172a", borderRadius: 8, display: "block" }}>
        <path d="M 160 284 L 18 95 Q 160 -15 302 95 Z"
          fill="#14532d" fillOpacity="0.35" />
        <path d="M 18 95 Q 160 -15 302 95"
          fill="none" stroke="#4b5563" strokeWidth="2" />
        <polygon points="160,284 235,215 160,145 85,215"
          fill="#78350f" fillOpacity="0.35" stroke="#6b7280" strokeWidth="1.5" />
        <line x1="160" y1="284" x2="18"  y2="95" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="5 4"/>
        <line x1="160" y1="284" x2="302" y2="95" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="5 4"/>
        <circle cx="160" cy="200" r="8" fill="#292524" stroke="#6b7280" strokeWidth="1.2"/>
        <polygon points="153,291 167,291 169,283 160,279 151,283" fill="#d1d5db"/>
        <rect x="229" y="209" width="12" height="12" rx="1" fill="#e5e7eb" transform="rotate(45 235 215)"/>
        <rect x="154" y="139" width="12" height="12" rx="1" fill="#e5e7eb" transform="rotate(45 160 145)"/>
        <rect x="79"  y="209" width="12" height="12" rx="1" fill="#e5e7eb" transform="rotate(45 85 215)"/>
        <text x="42"  y="62" textAnchor="middle" fontSize="11" fill="#6b7280" fontFamily="sans-serif">LF</text>
        <text x="160" y="22" textAnchor="middle" fontSize="11" fill="#6b7280" fontFamily="sans-serif">CF</text>
        <text x="278" y="62" textAnchor="middle" fontSize="11" fill="#6b7280" fontFamily="sans-serif">RF</text>
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r="6"
            fill={d.hit ? "#22c55e" : "#6b7280"}
            fillOpacity="0.9"
            stroke={d.hit ? "#15803d" : "#374151"}
            strokeWidth="1.2"/>
        ))}
      </svg>

      {dots.length === 0 && (
        <div className="mt-3 text-gray-400 text-sm text-center">
          暂无打击方向数据（结果需含守备位置，如 "7-5"、"6H"）
        </div>
      )}

      <div className="flex items-center gap-5 mt-3 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500" />安打 Hit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-gray-500" />出局 Out
        </span>
        <span className="ml-auto text-gray-600">{dots.length} 打席有方向数据</span>
      </div>
    </div>
  );
}

// ── Category label helper ────────────────────────────────────────────────────
function categoryLabel(cat: ChartCategory): string {
  const map: Record<string, string> = {
    batting:  "打击",
    pitching: "投球",
    scouting: "数据分析",
  };
  return map[cat] ?? cat;
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function PlayerPage() {
  const params   = useParams();
  const router   = useRouter();
  const teamId   = params.id as string;
  const playerId = params.playerId as string;

  const [team,          setTeam]          = useState<Team | null>(null);
  const [player,        setPlayer]        = useState<Player | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState<"stats" | "charts">("stats");
  const [selectedChart, setSelectedChart] = useState<ChartFile | null>(null);
  const [pdfUrl,        setPdfUrl]        = useState<string | null>(null);
  // null = auto (pitcher's own view for a pitcher, catcher's view otherwise)
  const [perspective,   setPerspective]   = useState<"pitcher" | "catcher" | null>(null);
  // pitchers only: filter thrown pitches by the opposing batter's handedness
  const [batsFilter,    setBatsFilter]    = useState<"L" | "R" | null>(null);

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

  useEffect(() => { setPerspective(null); setBatsFilter(null); }, [playerId]);

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

  // ── Perspective: pitcher sees their own view; everyone else uses catcher view
  const isPitcher = player.position === "P";
  // catcher's view mirrors differently for a left-handed batter (see PlayerCharts.tsx);
  // for a pitcher's chart this is whichever batter split is currently shown, for
  // anyone else it's simply their own batting hand.
  const ownBats: "L" | "R" | undefined = player.bats === "L" || player.bats === "R" ? player.bats : undefined;
  const batterHand = isPitcher ? batsFilter ?? undefined : ownBats;

  // ── Aggregate stats ────────────────────────────────────────────────────────
  const allAtBats: AtBat[] = player.gameStats.flatMap((gs) => gs.atBats);
  const totalAB = allAtBats.length; // actually plate appearances (打席) — BB/HBP/SAC/etc. included
  const hits    = allAtBats.filter((ab) => ["1B", "2B", "3B", "HR"].includes(ab.result)).length;
  // 打击率 (batting average) is hits / at-bats — BB/IBB/HBP/SAC/SF/CI don't count as an at-bat
  const trueAB  = trueAtBats(allAtBats);
  const avg     = trueAB > 0 ? (hits / trueAB).toFixed(3) : ".000";
  const fps     = allAtBats.filter((ab) => ab.firstPitchStrike).length;
  const fpsRate = totalAB > 0 ? ((fps / totalAB) * 100).toFixed(1) : "0.0";

  // Result breakdown
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
      {/* ── Top nav ────────────────────────────────────────────────────────── */}
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
            #{player.number} {bilingualName(team, player)}
          </span>
          <div className="ml-auto flex gap-2 text-sm text-gray-400">
            {player.throws && <span>投：{player.throws}</span>}
            {player.bats   && <span>打：{player.bats}</span>}
            <span>{positionLabel(player)}</span>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* ── Summary cards ───────────────────────────────────────────────── */}
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

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1 w-fit">
          {(["stats", "charts"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? "bg-green-600 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "stats" ? "打击数据" : "图表"}
            </button>
          ))}
        </div>

        {/* ── Stats tab ───────────────────────────────────────────────────── */}
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
                      const h  = gs.atBats.filter((a) => ["1B", "2B", "3B", "HR"].includes(a.result)).length;
                      return (
                        <tr key={gs.id} className="border-t border-gray-700 hover:bg-gray-750">
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
                      <div key={result}
                        className="bg-gray-700 rounded-lg px-4 py-3 text-center min-w-[80px]">
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

            {/* ── First Pitch Strike % ──────────────────────────────────── */}
            {totalAB > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-5">
                  首球好球率{" "}
                  <span className="text-sm font-normal text-gray-400">First Pitch Strike %</span>
                </h3>
                <FirstPitchStrikeGauge allAtBats={allAtBats} />
              </div>
            )}

            {/* ── Spray Chart ───────────────────────────────────────────── */}
            {totalAB > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-5">
                  打击落点图{" "}
                  <span className="text-sm font-normal text-gray-400">Spray Chart</span>
                </h3>
                <SprayChart allAtBats={allAtBats} />
              </div>
            )}

            {/* ── Faced pitches (Supabase) ──────────────────────────────── */}
            {(player.pitchLocationStats.length > 0 ||
              player.gameStats.some((gs) => gs.atBats.some((ab) => ab.pitchZone !== undefined))) && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-gray-400">热区图视角</span>
                <PerspectiveToggle value={perspective} onChange={setPerspective} />
                {isPitcher && player.pitchLocationStats.some((s) => s.vsBats) && (
                  <>
                    <span className="text-sm text-gray-400 ml-2">对战</span>
                    <BatsFilterToggle value={batsFilter} onChange={setBatsFilter} />
                  </>
                )}
              </div>
            )}

            {player.pitchLocationStats.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2">
                  {isPitcher ? "投球位置" : "面对来球位置"}{" "}
                  <span className="text-sm font-normal text-gray-400">{isPitcher ? "Pitch Locations" : "Faced Pitches"}</span>
                </h3>
                <PitchZoneHeatMap stats={filterByBats(player.pitchLocationStats, isPitcher ? batsFilter : null)} isPitcher={isPitcher} perspective={perspective ?? undefined} batterHand={batterHand} />
              </div>
            )}

            {/* ── Hit Zone Heatmap ──────────────────────────────────────── */}
            {player.gameStats.some((gs) =>
              gs.atBats.some((ab) => ab.pitchZone !== undefined)
            ) && (
              <div className="bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-2">
                  打击热区{" "}
                  <span className="text-sm font-normal text-gray-400">Hit Zone</span>
                </h3>
                <p className="text-xs text-gray-500 mb-5">
                  各投球区域的安打率——颜色越深越容易打出安打
                </p>
                <HitZoneHeatMap gameStats={player.gameStats} isPitcher={isPitcher} perspective={perspective ?? undefined} batterHand={ownBats} />
              </div>
            )}

          </div>
        )}

        {/* ── Charts tab ──────────────────────────────────────────────────── */}
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

      {/* ── PDF overlay ─────────────────────────────────────────────────────── */}
      {selectedChart && pdfUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-4xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <span className="font-medium">{CHART_TYPE_LABELS[selectedChart.type]}</span>
              <button
                onClick={() => { setSelectedChart(null); setPdfUrl(null); }}
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
