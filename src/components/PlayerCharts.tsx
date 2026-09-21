"use client";

import { AtBat, GameStat, PitchLocationStat } from "@/lib/types";

export function isHitResult(r: string) {
  return (
    ["1B", "2B", "3B", "HR"].includes(r) ||
    r.endsWith("HR") ||
    (r.length >= 2 && r.endsWith("H") && !r.endsWith("HR"))
  );
}

// results that are a plate appearance but not an at-bat (standard scoring rules)
const NON_AB_RESULTS = new Set(["BB", "IBB", "HBP", "SAC", "SF", "CI"]);

export function trueAtBats(atBats: AtBat[]): number {
  return atBats.filter((ab) => !NON_AB_RESULTS.has(ab.result)).length;
}

// ── Black & white print mode ────────────────────────────────────────────────
// Shading is grey (darker = higher) but capped at a mid-grey, so the numbers can
// always be plain black text — flipping to white text on dark cells leaves an
// unreadable mid-tone band on a mono printer's halftone. The middle 3x3 — the
// actual strike zone — gets a thick black frame so it still reads without colour.
const PRINT_INK = "#111111";
const PRINT_GRID = "#999999";
const PRINT_SUB = "#222222";
const printShade = (intensity: number, has: boolean) =>
  has ? `rgba(0,0,0,${(0.05 + 0.37 * intensity).toFixed(3)})` : "#ffffff";

function StrikeZoneFrame() {
  return (
    <div style={{
      position: "absolute", left: 50, top: 50, width: 150, height: 150,
      border: "3px solid #000", boxSizing: "border-box", pointerEvents: "none",
    }} />
  );
}

// ── Faced / thrown pitches heat-map (Supabase pitch_location_stats) ─────────
export function PitchZoneHeatMap({ stats, isPitcher, prominentLabels = false, print = false }: { stats: PitchLocationStat[]; isPitcher: boolean; prominentLabels?: boolean; print?: boolean }) {
  if (stats.length === 0) {
    return <div className="text-center text-gray-400 py-8">暂无投球位置数据</div>;
  }
  const totals = Array(25).fill(0);
  let grandTotal = 0;
  for (const s of stats) {
    for (let i = 0; i < 25; i++) totals[i] += s.zoneCounts[i] ?? 0;
    grandTotal += s.zoneCounts.reduce((a, b) => a + b, 0);
  }
  const maxCount = Math.max(...totals, 1);
  const prominent = prominentLabels || print;
  const colLabels = prominent
    ? (isPitcher ? ["外角", "", "", "", "内角"] : ["内角", "", "", "", "外角"])
    : (isPitcher ? ["外", "", "", "", "内"] : ["内", "", "", "", "外"]);
  const axisLabelClass = print ? "text-sm font-bold" : prominent ? "text-sm font-semibold text-slate-100" : "text-xs text-gray-400";
  const axisStyle = print ? { color: PRINT_INK } : undefined;
  const rowLabels = ["高", "", "", "", "低"];
  const perspectiveLabel = isPitcher ? "← 外角　　　内角 →（投手视角）" : "← 内角　　　外角 →（捕手视角）";

  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="flex flex-col justify-around" style={{ height: 250 }}>
          {rowLabels.map((l, i) => (
            <span key={i} className={`${axisLabelClass} ${prominent ? "w-5" : "w-4"} text-right`} style={axisStyle}>{l}</span>
          ))}
        </div>
        <div>
          <div className={`grid border ${print ? "border-2 relative" : "border-gray-600"}`}
            style={{ gridTemplateColumns: "repeat(5, 50px)", gridTemplateRows: "repeat(5, 50px)", ...(print ? { borderColor: PRINT_INK } : {}) }}>
            {Array.from({ length: 25 }, (_, displayIdx) => {
              const row = Math.floor(displayIdx / 5);
              const col = displayIdx % 5;
              const dataIdx = isPitcher ? displayIdx : row * 5 + (4 - col);
              const count = totals[dataIdx];
              const prob = grandTotal > 0 ? count / grandTotal : 0;
              const intensity = count / maxCount;
              return (
                <div key={displayIdx}
                  style={print
                    ? { backgroundColor: printShade(intensity, count > 0), borderColor: PRINT_GRID }
                    : { backgroundColor: `rgba(34,197,94,${Math.max(0.05, intensity)})` }}
                  className={`border ${print ? "" : "border-gray-700"} flex flex-col items-center justify-center`}>
                  <span className={`text-xs font-bold ${print ? "" : "text-white"}`}
                    style={print ? { color: PRINT_INK } : undefined}>{count}</span>
                  <span className={`text-[10px] ${print ? "" : "text-gray-300"}`}
                    style={print ? { color: PRINT_SUB } : undefined}>
                    {grandTotal > 0 ? (prob * 100).toFixed(1) + "%" : "0%"}
                  </span>
                </div>
              );
            })}
            {print && <StrikeZoneFrame />}
          </div>
          <div className="flex mt-1" style={{ width: 250 }}>
            {colLabels.map((l, i) => (
              <span key={i} className={`${axisLabelClass} text-center`} style={{ width: 50, ...axisStyle }}>{l}</span>
            ))}
          </div>
          <div className={`text-center text-xs mt-1 ${print ? "" : prominent ? "text-slate-300" : "text-gray-500"}`} style={print ? { color: "#333333" } : undefined}>{perspectiveLabel}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-500" style={print ? { color: "#333333" } : undefined}>
        总投球数：{grandTotal}　来源场次：{stats.length}
        {print && <div className="mt-0.5">越深 = 球越多　粗黑框 = 好球带</div>}
      </div>
    </div>
  );
}

// ── First Pitch Strike Gauge ─────────────────────────────────────────────────
export function FirstPitchStrikeGauge({ allAtBats }: { allAtBats: AtBat[] }) {
  const total = allAtBats.length;
  const fps = allAtBats.filter((ab) => ab.firstPitchStrike).length;
  if (total === 0) return <div className="text-gray-400 text-sm">暂无打席数据</div>;
  const rate = (fps / total) * 100;
  const r = 48;
  const circ = 2 * Math.PI * r;
  const dash = (circ * rate) / 100;
  const color = rate >= 60 ? "#22c55e" : rate >= 45 ? "#eab308" : "#ef4444";
  return (
    <div className="flex flex-wrap items-center gap-10">
      <div className="relative" style={{ width: 130, height: 130 }}>
        <svg width="130" height="130" viewBox="0 0 130 130">
          <circle cx="65" cy="65" r={r} fill="none" stroke="#374151" strokeWidth="12" />
          <circle
            cx="65" cy="65" r={r}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            transform="rotate(-90 65 65)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{rate.toFixed(1)}%</span>
          <span className="text-[10px] text-gray-400">首球好球</span>
        </div>
      </div>
      <div className="space-y-3 flex-1 min-w-[160px]">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">首球好球 Strike</span>
            <span className="font-bold" style={{ color }}>{fps}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div className="h-2 rounded-full" style={{ width: `${rate}%`, backgroundColor: color }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">首球坏球 Ball</span>
            <span className="text-red-400 font-bold">{total - fps}</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div className="h-2 rounded-full bg-red-500" style={{ width: `${100 - rate}%` }} />
          </div>
        </div>
        <div className="text-xs text-gray-500 pt-1">共 {total} 打席</div>
      </div>
    </div>
  );
}

// ── Hit Zone Heat-Map ────────────────────────────────────────────────────────
export function HitZoneHeatMap({ gameStats, isPitcher, prominentLabels = false, print = false }: { gameStats: GameStat[]; isPitcher: boolean; prominentLabels?: boolean; print?: boolean }) {
  const zoneHits   = Array(25).fill(0);
  const zoneTotals = Array(25).fill(0);

  for (const gs of gameStats) {
    for (const ab of gs.atBats) {
      if (ab.pitchZone !== undefined && ab.pitchZone >= 0 && ab.pitchZone < 25) {
        zoneTotals[ab.pitchZone]++;
        if (isHitResult(ab.result)) zoneHits[ab.pitchZone]++;
      }
    }
  }

  if (!zoneTotals.some((t) => t > 0)) {
    return (
      <div className="text-center text-gray-400 py-4 text-sm">
        暂无打区安打数据（需含 pitchZone 字段）
      </div>
    );
  }

  const hitRates = zoneTotals.map((t, i) => (t > 0 ? zoneHits[i] / t : 0));
  const maxRate  = Math.max(...hitRates, 0.01);
  const prominent = prominentLabels || print;
  const colLabels = prominent
    ? (isPitcher ? ["外角", "", "", "", "内角"] : ["内角", "", "", "", "外角"])
    : (isPitcher ? ["外", "", "", "", "内"] : ["内", "", "", "", "外"]);
  const axisLabelClass = print ? "text-sm font-bold" : prominent ? "text-sm font-semibold text-slate-100" : "text-xs text-gray-400";
  const axisStyle = print ? { color: PRINT_INK } : undefined;
  const rowLabels = ["高", "", "", "", "低"];
  const perspectiveLabel = isPitcher ? "← 外角　　　内角 →（投手视角）" : "← 内角　　　外角 →（捕手视角）";

  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="flex flex-col justify-around" style={{ height: 250 }}>
          {rowLabels.map((l, i) => (
            <span key={i} className={`${axisLabelClass} ${prominent ? "w-5" : "w-4"} text-right`} style={axisStyle}>{l}</span>
          ))}
        </div>
        <div>
          <div className={`grid border ${print ? "border-2 relative" : "border-gray-600"}`}
            style={{ gridTemplateColumns: "repeat(5, 50px)", gridTemplateRows: "repeat(5, 50px)", ...(print ? { borderColor: PRINT_INK } : {}) }}>
            {Array.from({ length: 25 }, (_, displayIdx) => {
              const row = Math.floor(displayIdx / 5);
              const col = displayIdx % 5;
              const dataIdx = isPitcher ? displayIdx : row * 5 + (4 - col);
              const rate  = hitRates[dataIdx];
              const total = zoneTotals[dataIdx];
              const hits  = zoneHits[dataIdx];
              const intensity = rate / maxRate;
              const alpha = total === 0 ? 0 : Math.max(0.07, intensity);
              return (
                <div key={displayIdx}
                  style={print
                    ? { backgroundColor: printShade(intensity, total > 0), borderColor: PRINT_GRID }
                    : { backgroundColor: `rgba(251,146,60,${alpha})` }}
                  className={`border ${print ? "" : "border-gray-700"} flex flex-col items-center justify-center`}>
                  {total > 0 ? (
                    <>
                      <span className={`text-xs font-bold ${print ? "" : "text-white"}`}
                        style={print ? { color: PRINT_INK } : undefined}>{hits}/{total}</span>
                      <span className={`text-[10px] ${print ? "" : "text-gray-300"}`}
                        style={print ? { color: PRINT_SUB } : undefined}>
                        {(rate * 100).toFixed(0)}%
                      </span>
                    </>
                  ) : (
                    <span className={`text-xs ${print ? "" : "text-gray-600"}`}
                      style={print ? { color: PRINT_GRID } : undefined}>—</span>
                  )}
                </div>
              );
            })}
            {print && <StrikeZoneFrame />}
          </div>
          <div className="flex mt-1" style={{ width: 250 }}>
            {colLabels.map((l, i) => (
              <span key={i} className={`${axisLabelClass} text-center`} style={{ width: 50, ...axisStyle }}>{l}</span>
            ))}
          </div>
          <div className={`text-center text-xs mt-1 ${print ? "" : prominent ? "text-slate-300" : "text-gray-500"}`} style={print ? { color: "#333333" } : undefined}>{perspectiveLabel}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-500" style={print ? { color: "#333333" } : undefined}>
        {print ? "越深 = 安打率越高　粗黑框 = 好球带" : "颜色越深 = 该区安打率越高"}
      </div>
    </div>
  );
}
