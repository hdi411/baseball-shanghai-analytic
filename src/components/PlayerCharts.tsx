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
// `perspective` lets the viewer flip the left/right orientation regardless of the
// player's real position (defaults to the usual pitcher-throws / everyone-else-
// catcher's-view rule when omitted).
//
// `batterHand` matters only in catcher's view. zoneCounts is already inside/outside
// relative to the actual batter (confirmed against real HBP data: always deep
// "inside" regardless of the batter's hand, so the raw field is pre-flipped for
// stance, not tied to a fixed field side) — that's why pitcher's view needs no
// per-batter adjustment. But a real catcher stands behind a FIXED point on the
// field: a right-handed batter's body is on the catcher's left, a left-handed
// batter's is on the catcher's right, so which screen side "inside" belongs on
// flips between them. Default (RHB / unknown / switch) keeps the long-standing
// mirrored layout; "L" cancels the mirror so it matches pitcher's view instead.
export function PitchZoneHeatMap({ stats, isPitcher, perspective, batterHand, prominentLabels = false, print = false }: { stats: PitchLocationStat[]; isPitcher: boolean; perspective?: "pitcher" | "catcher"; batterHand?: "L" | "R"; prominentLabels?: boolean; print?: boolean }) {
  if (stats.length === 0) {
    return <div className="text-center text-gray-400 py-8">暂无投球位置数据</div>;
  }
  const pitcherView = (perspective ?? (isPitcher ? "pitcher" : "catcher")) === "pitcher";
  const mirror = !pitcherView && batterHand !== "L";
  const totals = Array(25).fill(0);
  let grandTotal = 0;
  for (const s of stats) {
    for (let i = 0; i < 25; i++) totals[i] += s.zoneCounts[i] ?? 0;
    grandTotal += s.zoneCounts.reduce((a, b) => a + b, 0);
  }
  const maxCount = Math.max(...totals, 1);
  const prominent = prominentLabels || print;
  const colLabels = mirror ? ["In", "", "", "", "Out"] : ["Out", "", "", "", "In"];
  const axisLabelClass = print ? "text-sm font-bold" : prominent ? "text-sm font-semibold text-slate-100" : "text-xs text-gray-400";
  const axisStyle = print ? { color: PRINT_INK } : undefined;
  const rowLabels = ["High", "", "", "", "Low"];
  const perspectiveLabel = (mirror ? "← In　　　Out →" : "← Out　　　In →") + (pitcherView ? "（投手视角）" : "（捕手视角）");

  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="flex flex-col justify-around" style={{ height: 250 }}>
          {rowLabels.map((l, i) => (
            <span key={i} className={`${axisLabelClass} w-9 text-right`} style={axisStyle}>{l}</span>
          ))}
        </div>
        <div>
          <div className={`grid border ${print ? "border-2 relative" : "border-gray-600"}`}
            style={{ gridTemplateColumns: "repeat(5, 50px)", gridTemplateRows: "repeat(5, 50px)", ...(print ? { borderColor: PRINT_INK } : {}) }}>
            {Array.from({ length: 25 }, (_, displayIdx) => {
              const row = Math.floor(displayIdx / 5);
              const col = displayIdx % 5;
              const dataIdx = mirror ? row * 5 + (4 - col) : displayIdx;
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

// ── Perspective toggle (捕手视角 / 投手视角) ──────────────────────────────────
// Shared by the player page and the heatmap export page. `value` is the override;
// null means "auto" — pitcher's own view for a pitcher, catcher's view otherwise.
export function PerspectiveToggle({
  value, onChange, autoLabel = "自动",
}: {
  value: "pitcher" | "catcher" | null;
  onChange: (v: "pitcher" | "catcher" | null) => void;
  autoLabel?: string;
}) {
  const opts: { key: "pitcher" | "catcher" | null; label: string }[] = [
    { key: null, label: autoLabel },
    { key: "catcher", label: "捕手视角" },
    { key: "pitcher", label: "投手视角" },
  ];
  return (
    <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid #334155" }}>
      {opts.map((o) => (
        <button key={o.label} type="button" onClick={() => onChange(o.key)}
          className="text-sm px-3 py-1.5"
          style={{
            background: value === o.key ? "#22c55e" : "transparent",
            color: value === o.key ? "#0f172a" : "#94a3b8",
            fontWeight: 500,
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Card content toggle (热区 / 球数) ─────────────────────────────────────────
// Heatmap export page only: whether a pitcher's card shows the pitch-location heatmap
// ("zone") or the results by ball-strike count ("count").
export function ContentViewToggle({
  value, onChange,
}: {
  value: "zone" | "count";
  onChange: (v: "zone" | "count") => void;
}) {
  const opts: { key: "zone" | "count"; label: string }[] = [
    { key: "zone", label: "热区" },
    { key: "count", label: "球数" },
  ];
  return (
    <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid #334155" }}>
      {opts.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)}
          className="text-sm px-3 py-1.5"
          style={{
            background: value === o.key ? "#22c55e" : "transparent",
            color: value === o.key ? "#0f172a" : "#94a3b8",
            fontWeight: 500,
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Bats-split VIEW toggle (全部 / 左右打者) ───────────────────────────────────
// Heatmap export page only: whether a pitcher's thrown-pitch chart shows one
// combined heatmap ("全部") or the vs-LHB / vs-RHB pair side by side ("左右打者").
export function BatsViewToggle({
  value, onChange,
}: {
  value: "all" | "split";
  onChange: (v: "all" | "split") => void;
}) {
  const opts: { key: "all" | "split"; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "split", label: "左右打者" },
  ];
  return (
    <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid #334155" }}>
      {opts.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)}
          className="text-sm px-3 py-1.5"
          style={{
            background: value === o.key ? "#22c55e" : "transparent",
            color: value === o.key ? "#0f172a" : "#94a3b8",
            fontWeight: 500,
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Bats-split toggle (全部 / 左打者 / 右打者) ─────────────────────────────────
// Pitchers only: filters PitchZoneHeatMap's thrown-pitch stats down to pitches
// thrown to left- or right-handed batters (see vs_bats in pitch_location_stats).
export function BatsFilterToggle({
  value, onChange,
}: {
  value: "L" | "R" | null;
  onChange: (v: "L" | "R" | null) => void;
}) {
  const opts: { key: "L" | "R" | null; label: string }[] = [
    { key: null, label: "全部" },
    { key: "L", label: "对左打者" },
    { key: "R", label: "对右打者" },
  ];
  return (
    <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid #334155" }}>
      {opts.map((o) => (
        <button key={o.label} type="button" onClick={() => onChange(o.key)}
          className="text-sm px-3 py-1.5"
          style={{
            background: value === o.key ? "#22c55e" : "transparent",
            color: value === o.key ? "#0f172a" : "#94a3b8",
            fontWeight: 500,
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Picks the pitch_location_stats rows matching a bats filter: the plain
// (vsBats undefined) rows for "全部", or the matching split rows for L/R.
export function filterByBats(stats: PitchLocationStat[], batsFilter: "L" | "R" | null): PitchLocationStat[] {
  return stats.filter((s) => (batsFilter === null ? s.vsBats === undefined : s.vsBats === batsFilter));
}

// ── Pitches by count (pitchers) ──────────────────────────────────────────────
const COUNT_TYPES: { key: string; label: string }[] = [
  { key: "called_strike", label: "看进好球 Called" },
  { key: "swinging_strike", label: "挥空 Swinging" },
  { key: "foul", label: "界外 Foul" },
  { key: "in_play", label: "击球入场 In play" },
];
// 好球 = anything that is not a ball: called, swinging, foul and balls put in play; 坏球 = ball or hit batter
const STRIKE_TYPES = ["called_strike", "swinging_strike", "foul", "in_play"];
const BALL_TYPES = ["ball", "hbp"];
// every ball-strike count, in the usual order: 0-0, 0-1, 0-2, 1-0, ...
const ALL_COUNTS = [0, 1, 2, 3].flatMap((b) => [0, 1, 2].map((s) => `${b}-${s}`));

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

// How a pitcher's pitches turn out at every ball-strike count: the strike / ball share
// (strike = called + swinging + foul + in play; ball = ball + hit batter, so the two add up
// to 100%) and the full mix of results. Every percentage has the same denominator: all the
// pitches thrown at that count. Two-strike counts are shaded, since that is where it matters most.
//
// `print` is the black-and-white version for the export page: plain black text, grey lines and
// shading, no green / red.
export function CountPanel({ stats, print = false }: { stats: PitchLocationStat[]; print?: boolean }) {
  const ink = print ? { color: PRINT_INK } : undefined;
  const inkMid = print ? { color: "#333333" } : undefined;
  const byCount: Record<string, Record<string, number>> = {};
  for (const s of stats) {
    for (const [count, types] of Object.entries(s.countCounts ?? {})) {
      const acc = (byCount[count] ??= {});
      for (const [type, n] of Object.entries(types)) acc[type] = (acc[type] ?? 0) + n;
    }
  }
  const sumOf = (types: Record<string, number> | undefined, keys?: string[]) =>
    Object.entries(types ?? {}).reduce((t, [k, n]) => (!keys || keys.includes(k) ? t + n : t), 0);
  const merge = (counts: string[]) => {
    const out: Record<string, number> = {};
    for (const c of counts) for (const [k, n] of Object.entries(byCount[c] ?? {})) out[k] = (out[k] ?? 0) + n;
    return out;
  };
  const overall = merge(ALL_COUNTS);
  const total = sumOf(overall);
  if (total === 0) return <div className="text-gray-400 text-sm">暂无投球数据</div>;

  const games = stats.filter((s) => s.countCounts).length;
  const twoStrike = merge(ALL_COUNTS.filter((c) => c.endsWith("-2")));

  // 好球 / 坏球 headline for a set of pitches
  const headline = (label: string, types: Record<string, number>) => {
    const strikes = sumOf(types, STRIKE_TYPES);
    const balls = sumOf(types, BALL_TYPES);
    return (
      <div>
        <div className={`text-xs mb-1 ${print ? "" : "text-gray-400"}`} style={inkMid}>{label}（{sumOf(types)} 球）</div>
        <div className="flex items-baseline gap-4">
          <span className={`text-2xl font-bold ${print ? "" : "text-green-400"}`} style={ink}>{pct(strikes, sumOf(types))}<span className={`text-xs font-normal ml-1 ${print ? "" : "text-gray-400"}`} style={inkMid}>好球 Strike</span></span>
          <span className={`text-2xl font-bold ${print ? "" : "text-red-400"}`} style={ink}>{pct(balls, sumOf(types))}<span className={`text-xs font-normal ml-1 ${print ? "" : "text-gray-400"}`} style={inkMid}>坏球 Ball</span></span>
        </div>
      </div>
    );
  };

  const row = (label: string, types: Record<string, number> | undefined, opts: { shade?: boolean; bold?: boolean } = {}) => {
    const n = sumOf(types);
    const strikes = sumOf(types, STRIKE_TYPES);
    const balls = sumOf(types, BALL_TYPES);
    return (
      <tr key={label}
        className={`border-t ${print ? "" : opts.bold ? "border-gray-600" : "border-gray-700"} ${opts.bold ? "font-semibold" : ""}`}
        style={{
          ...(print ? { borderColor: PRINT_GRID, color: PRINT_INK } : {}),
          ...(opts.shade ? { background: print ? "rgba(0,0,0,0.07)" : "rgba(148,163,184,0.08)" } : {}),
        }}>
        <td className={`py-2 pr-4 ${opts.bold || print ? "" : "text-gray-300"}`}>{label}</td>
        <td className="py-2 px-2 text-right">{n}</td>
        <td className={`py-2 px-2 text-right ${print ? "" : "text-green-400"}`}>{pct(strikes, n)}</td>
        <td className={`py-2 px-2 text-right ${print ? "" : "text-red-400"}`}>{pct(balls, n)}</td>
        {COUNT_TYPES.map((t) => (
          <td key={t.key} className="py-2 px-2 text-right">
            {n > 0 ? pct(types?.[t.key] ?? 0, n) : <span className={print ? "" : "text-gray-600"} style={print ? { color: PRINT_GRID } : undefined}>—</span>}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-12 gap-y-3 mb-4">
        {headline("全部球数 All counts", overall)}
        {headline("两好球后 Two strikes", twoStrike)}
        <div className={`text-xs ${print ? "" : "text-gray-500"}`} style={inkMid}>
          共 {total} 球（{games} 场）　好球 = 看进＋挥空＋界外＋击球入场　坏球 = 坏球＋触身　百分比都是占该球数全部投球的比例
        </div>
      </div>

      <div className={print ? "" : "overflow-x-auto"}>
        <table className="w-full text-sm">
          <thead>
            <tr className={`text-xs ${print ? "" : "text-gray-400"}`} style={inkMid}>
              <th className="text-left font-normal py-2 pr-4">球数 Count</th>
              <th className="text-right font-normal py-2 px-2">投球数</th>
              <th className="text-right font-normal py-2 px-2 whitespace-nowrap">好球 Strike%</th>
              <th className="text-right font-normal py-2 px-2 whitespace-nowrap">坏球 Ball%</th>
              {COUNT_TYPES.map((t) => (
                <th key={t.key} className="text-right font-normal py-2 px-2 whitespace-nowrap">{t.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_COUNTS.map((c) => row(c, byCount[c], { shade: c.endsWith("-2") }))}
            {row("合计 Total", overall, { bold: true })}
          </tbody>
        </table>
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
export function HitZoneHeatMap({ gameStats, isPitcher, perspective, batterHand, prominentLabels = false, print = false }: { gameStats: GameStat[]; isPitcher: boolean; perspective?: "pitcher" | "catcher"; batterHand?: "L" | "R"; prominentLabels?: boolean; print?: boolean }) {
  const pitcherView = (perspective ?? (isPitcher ? "pitcher" : "catcher")) === "pitcher";
  const mirror = !pitcherView && batterHand !== "L";
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
  const colLabels = mirror ? ["In", "", "", "", "Out"] : ["Out", "", "", "", "In"];
  const axisLabelClass = print ? "text-sm font-bold" : prominent ? "text-sm font-semibold text-slate-100" : "text-xs text-gray-400";
  const axisStyle = print ? { color: PRINT_INK } : undefined;
  const rowLabels = ["High", "", "", "", "Low"];
  const perspectiveLabel = (mirror ? "← In　　　Out →" : "← Out　　　In →") + (pitcherView ? "（投手视角）" : "（捕手视角）");

  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="flex flex-col justify-around" style={{ height: 250 }}>
          {rowLabels.map((l, i) => (
            <span key={i} className={`${axisLabelClass} w-9 text-right`} style={axisStyle}>{l}</span>
          ))}
        </div>
        <div>
          <div className={`grid border ${print ? "border-2 relative" : "border-gray-600"}`}
            style={{ gridTemplateColumns: "repeat(5, 50px)", gridTemplateRows: "repeat(5, 50px)", ...(print ? { borderColor: PRINT_INK } : {}) }}>
            {Array.from({ length: 25 }, (_, displayIdx) => {
              const row = Math.floor(displayIdx / 5);
              const col = displayIdx % 5;
              const dataIdx = mirror ? row * 5 + (4 - col) : displayIdx;
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
