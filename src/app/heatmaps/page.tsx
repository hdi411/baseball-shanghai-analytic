"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { getTeam, getTeamList } from "@/lib/store";
import { englishPlayerName, englishTeamName } from "@/lib/englishNames";
import type { Team, Player } from "@/lib/types";
import { positionLabel } from "@/lib/types";
import { HitZoneHeatMap, PitchZoneHeatMap, PerspectiveToggle, BatsViewToggle, filterByBats, trueAtBats } from "@/components/PlayerCharts";

const DARK_CARD_BG = "#1e293b";
const PRINT_CARD_BG = "#ffffff";

function hasHitZoneData(p: Player) {
  return p.gameStats.some((gs) => gs.atBats.some((ab) => ab.pitchZone !== undefined));
}
function hasPitchData(p: Player) {
  return p.pitchLocationStats.length > 0;
}
function hasAnyData(p: Player) {
  return hasHitZoneData(p) || hasPitchData(p);
}

// keeps Chinese as-is; spaces become "-" (so "_" can separate the fields) and
// characters that aren't allowed in file names are dropped
function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "-");
}

// Bilingual file names: 中文 and English side by side. A field whose English name is
// unknown is simply left out rather than printed as a blank.
function joinName(...parts: (string | number)[]) {
  return parts.map((p) => safeName(String(p))).filter(Boolean).join("_");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function teamFileLabel(team: Team) {
  return joinName(team.shortName ?? team.name, englishTeamName(team));
}

// e.g. 上海虎鲸_Shanghai-Orcas_60_陈冠勋_Chen-Guan-Xun_热区图_Heatmap.pdf
function fileNameFor(team: Team, p: Player) {
  return `${joinName(team.shortName ?? team.name, englishTeamName(team), p.number, p.name || "球员", englishPlayerName(team, p), "热区图", "Heatmap")}.pdf`;
}

// e.g. 上海虎鲸_Shanghai-Orcas_热区图_Heatmap.pdf
function teamFileName(team: Team) {
  return `${joinName(teamFileLabel(team), "热区图", "Heatmap")}.pdf`;
}

// A4 landscape, one player per page. The page is filled with the app's own dark
// background so the card (which carries all the text, incl. Chinese — jsPDF's
// built-in fonts can't draw CJK) sits on it the same way it does on screen.
const PAGE_W = 297;
const PAGE_H = 210;
const PAGE_MARGIN = 10;
const PAGE_BG: [number, number, number] = [15, 23, 42];

function addCardPage(pdf: jsPDF, dataUrl: string, isFirst: boolean, print: boolean) {
  if (!isFirst) pdf.addPage("a4", "landscape");
  if (!print) {
    // screen version: dark page to match the card. The print version leaves the page
    // white — a dark page would be a solid black sheet on a mono printer.
    pdf.setFillColor(...PAGE_BG);
    pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
  }
  const img = pdf.getImageProperties(dataUrl);
  let w = PAGE_W - PAGE_MARGIN * 2;
  let h = (w * img.height) / img.width;
  const maxH = PAGE_H - PAGE_MARGIN * 2;
  if (h > maxH) {
    h = maxH;
    w = (h * img.width) / img.height;
  }
  // without an explicit compression mode jsPDF embeds the PNG uncompressed (~8 MB/page)
  pdf.addImage(dataUrl, "PNG", (PAGE_W - w) / 2, (PAGE_H - h) / 2, w, h, undefined, "FAST");
}

// The exported image is exactly this node, so anything not meant to be in the
// picture (buttons, checkboxes) has to live outside it.
function PlayerHeatCard({
  player, team, print, perspective, batsView, setRef,
}: {
  player: Player;
  team: Team;
  print: boolean;
  perspective: "pitcher" | "catcher" | null;
  batsView: "all" | "split";
  setRef: (el: HTMLDivElement | null) => void;
}) {
  const ink = print ? { color: "#111111" } : undefined;
  const inkMid = print ? { color: "#333333" } : undefined;
  const isPitcher = player.position === "P";
  // catcher's view mirrors differently for a left-handed batter (see PlayerCharts.tsx)
  const ownBats: "L" | "R" | undefined = player.bats === "L" || player.bats === "R" ? player.bats : undefined;
  const atBats = player.gameStats.flatMap((g) => g.atBats);
  const hits = atBats.filter((ab) => ["1B", "2B", "3B", "HR"].includes(ab.result)).length;
  const trueAB = trueAtBats(atBats);

  const hitBlock = hasHitZoneData(player) && (
    <div key="hit">
      <div className="text-sm font-semibold text-white mb-2" style={ink}>打击热区 Hit Zone</div>
      <HitZoneHeatMap gameStats={player.gameStats} isPitcher={isPitcher} perspective={perspective ?? undefined} batterHand={ownBats} prominentLabels print={print} />
    </div>
  );

  // A pitcher with batter-handedness data gets vs-LHB and vs-RHB side by side instead
  // of one filtered chart, so both are visible at once on the printed card. A count
  // reconciliation line accounts for every thrown pitch, including the few thrown to
  // switch hitters / unresolved batters that can't be put in either column.
  const hasSplit = isPitcher && batsView === "split" && player.pitchLocationStats.some((s) => s.vsBats);
  let pitchBlock: ReactNode = false;
  if (hasSplit) {
    const sum = (stats: typeof player.pitchLocationStats) =>
      stats.reduce((t, s) => t + s.zoneCounts.reduce((a, b) => a + b, 0), 0);
    const lStats = filterByBats(player.pitchLocationStats, "L");
    const rStats = filterByBats(player.pitchLocationStats, "R");
    const total = sum(filterByBats(player.pitchLocationStats, null));
    const unclassified = total - sum(lStats) - sum(rStats);
    pitchBlock = (
      <div key="pitch">
        <div className="text-sm font-semibold text-white mb-2" style={ink}>投球位置 Pitch Locations</div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="text-xs font-bold mb-1" style={ink}>对左打者 vs LHB</div>
            <PitchZoneHeatMap stats={lStats} isPitcher perspective={perspective ?? undefined} batterHand="L" prominentLabels print={print} />
          </div>
          <div>
            <div className="text-xs font-bold mb-1" style={ink}>对右打者 vs RHB</div>
            <PitchZoneHeatMap stats={rStats} isPitcher perspective={perspective ?? undefined} batterHand="R" prominentLabels print={print} />
          </div>
        </div>
        <div className="text-xs mt-2" style={print ? { color: "#333333" } : { color: "#64748b" }}>
          共 {total} 球　=　左 {sum(lStats)} ＋ 右 {sum(rStats)}
          {unclassified > 0 && ` ＋ 打者左右不明 ${unclassified}（未计入左右分类，仅计入总数）`}
        </div>
      </div>
    );
  } else if (hasPitchData(player)) {
    pitchBlock = (
      <div key="pitch">
        <div className="text-sm font-semibold text-white mb-2" style={ink}>
          {isPitcher ? "投球位置 Pitch Locations" : "面对来球位置 Faced Pitches"}
        </div>
        <PitchZoneHeatMap stats={filterByBats(player.pitchLocationStats, null)} isPitcher={isPitcher} perspective={perspective ?? undefined} batterHand={isPitcher ? undefined : ownBats} prominentLabels print={print} />
      </div>
    );
  }

  return (
    <div ref={setRef} style={{
      width: hasSplit ? 1000 : 720, background: print ? PRINT_CARD_BG : DARK_CARD_BG, padding: 20, borderRadius: 12,
      ...(print ? { border: "1px solid #999999" } : {}),
    }}>
      <div className="flex items-baseline gap-3 flex-wrap mb-4">
        <span className="text-lg font-bold text-white" style={ink}>#{player.number} {player.name || "?"}</span>
        <span className="text-sm text-slate-300" style={inkMid}>{positionLabel(player)}</span>
        <span className="text-sm text-slate-400" style={inkMid}>{team.name}</span>
        {trueAB > 0 && (
          <span className="text-sm text-slate-400 ml-auto" style={inkMid}>
            打击率 {(hits / trueAB).toFixed(3)}（{hits}/{trueAB}）
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
        {isPitcher ? [pitchBlock, hitBlock] : [hitBlock, pitchBlock]}
      </div>
    </div>
  );
}

export default function HeatmapExportPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState("");
  const [team, setTeam] = useState<Team | null>(null); // the selected team, with its stats
  const [teamLoading, setTeamLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [printMode, setPrintMode] = useState(true); // default: black & white, printer-friendly
  // null = auto per player (pitcher's own view for a pitcher, catcher's view otherwise);
  // set to one value to apply it to every exported card, regardless of position.
  const [perspective, setPerspective] = useState<"pitcher" | "catcher" | null>(null);
  // pitchers with handedness data: one combined chart ("all") or vs-LHB/vs-RHB side by side ("split")
  const [batsView, setBatsView] = useState<"all" | "split">("all");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    getTeamList().then((t) => {
      setTeams(t);
      setLoading(false);
      const home = t.find((x) => x.name.includes("上海") || (x.shortName ?? "").includes("上海"));
      if (home) setTeamId(home.id);
    });
  }, []);

  // Only the selected team's stats are fetched, so the page stays fast and far under the row cap.
  useEffect(() => {
    setTeam(null);
    if (!teamId) return;
    let stale = false;
    setTeamLoading(true);
    getTeam(teamId).then((t) => {
      if (stale) return;
      setTeam(t);
      setTeamLoading(false);
    });
    return () => { stale = true; };
  }, [teamId]);

  const players = useMemo(
    () => [...(team?.players ?? [])].sort((a, b) => Number(a.number) - Number(b.number)),
    [team],
  );
  const selectedPlayers = players.filter((p) => selected.has(p.id));

  function changeTeam(id: string) {
    setTeamId(id);
    setSelected(new Set());
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectWhere(pred: (p: Player) => boolean) {
    setSelected(new Set(players.filter((p) => hasAnyData(p) && pred(p)).map((p) => p.id)));
  }

  async function renderCard(playerId: string): Promise<string> {
    const node = cardRefs.current[playerId];
    if (!node) throw new Error("card not rendered");
    return toPng(node, { pixelRatio: 3, backgroundColor: printMode ? PRINT_CARD_BG : DARK_CARD_BG, cacheBust: true });
  }

  async function downloadOne(p: Player) {
    if (!team) return;
    setBusy(p.id);
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      addCardPage(pdf, await renderCard(p.id), true, printMode);
      triggerDownload(pdf.output("blob"), fileNameFor(team, p));
    } catch (e) {
      console.error(e);
      alert("导出失败，请重试");
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    if (!team || selectedPlayers.length === 0) return;
    setBusy("all");
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      for (let i = 0; i < selectedPlayers.length; i++) {
        setProgress(`${i + 1}/${selectedPlayers.length}`);
        addCardPage(pdf, await renderCard(selectedPlayers[i].id), i === 0, printMode);
      }
      triggerDownload(pdf.output("blob"), teamFileName(team));
    } catch (e) {
      console.error(e);
      alert("导出失败，请重试");
    } finally {
      setBusy(null);
      setProgress("");
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">加载中...</div>;
  }

  return (
    <div className="min-h-screen">
      <nav style={{ background: "#1e293b", borderBottom: "1px solid #334155" }} className="sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="btn btn-ghost text-sm px-3">← 返回</Link>
          <span className="font-semibold text-white">导出热区图</span>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="card p-5 mb-6">
          <select className="input mb-4 font-semibold" style={{ maxWidth: 420 }}
            value={teamId} onChange={(e) => changeTeam(e.target.value)}>
            <option value="">选择球队...</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          {teamId && teamLoading && <p className="text-sm" style={{ color: "#64748b" }}>加载球员数据...</p>}
          {team && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button className="btn btn-ghost text-sm" onClick={() => selectWhere(() => true)}>全选</button>
                <button className="btn btn-ghost text-sm" onClick={() => selectWhere((p) => p.position === "P")}>仅投手</button>
                <button className="btn btn-ghost text-sm" onClick={() => selectWhere((p) => p.position !== "P")}>仅野手</button>
                <button className="btn btn-ghost text-sm" onClick={() => setSelected(new Set())}>清空</button>
                <span className="text-xs ml-2" style={{ color: "#64748b" }}>
                  已选 {selectedPlayers.length} / {players.length}
                </span>
                <span className="text-xs ml-auto" style={{ color: "#64748b" }}>视角</span>
                <PerspectiveToggle value={perspective} onChange={setPerspective} />
                {players.some((p) => p.position === "P" && p.pitchLocationStats.some((s) => s.vsBats)) && (
                  <>
                    <span className="text-xs" style={{ color: "#64748b" }}>对战</span>
                    <BatsViewToggle value={batsView} onChange={setBatsView} />
                  </>
                )}
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid #334155" }}>
                  <button className="text-sm px-3 py-2" onClick={() => setPrintMode(true)}
                    style={{ background: printMode ? "#22c55e" : "transparent", color: printMode ? "#0f172a" : "#94a3b8", fontWeight: 500 }}>
                    黑白打印版
                  </button>
                  <button className="text-sm px-3 py-2" onClick={() => setPrintMode(false)}
                    style={{ background: !printMode ? "#22c55e" : "transparent", color: !printMode ? "#0f172a" : "#94a3b8", fontWeight: 500 }}>
                    彩色屏幕版
                  </button>
                </div>
                <button
                  className="btn btn-primary text-sm"
                  disabled={selectedPlayers.length === 0 || busy !== null}
                  style={{ opacity: selectedPlayers.length === 0 || busy !== null ? 0.5 : 1 }}
                  onClick={downloadAll}
                >
                  {busy === "all" ? `导出中 ${progress}...` : `导出 PDF（${selectedPlayers.length} 人）`}
                </button>
              </div>

              <div className="grid gap-x-4 gap-y-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
                {players.map((p) => {
                  const ok = hasAnyData(p);
                  return (
                    <label key={p.id}
                      className="flex items-center gap-2 text-sm py-1"
                      style={{ color: ok ? "#e2e8f0" : "#475569", cursor: ok ? "pointer" : "not-allowed" }}>
                      <input type="checkbox" disabled={!ok}
                        checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                      <span className="truncate">#{p.number} {p.name || "?"}</span>
                      <span className="text-xs" style={{ color: "#64748b" }}>{ok ? positionLabel(p) : "无数据"}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {team && selectedPlayers.length === 0 && (
          <div className="text-center py-16" style={{ color: "#64748b" }}>勾选球员后，这里会显示每人的热区图预览</div>
        )}

        {team && (
          <div className="flex flex-wrap gap-6">
            {selectedPlayers.map((p) => (
              <div key={p.id}>
                <PlayerHeatCard player={p} team={team} print={printMode} perspective={perspective} batsView={batsView} setRef={(el) => { cardRefs.current[p.id] = el; }} />
                <div className="mt-2 text-right">
                  <button className="btn btn-ghost text-sm" disabled={busy !== null} onClick={() => downloadOne(p)}>
                    {busy === p.id ? "导出中..." : "下载 PDF"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
