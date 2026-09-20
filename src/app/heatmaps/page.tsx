"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { getTeams } from "@/lib/store";
import type { Team, Player } from "@/lib/types";
import { HitZoneHeatMap, PitchZoneHeatMap, trueAtBats } from "@/components/PlayerCharts";

const CARD_BG = "#1e293b";

function hasHitZoneData(p: Player) {
  return p.gameStats.some((gs) => gs.atBats.some((ab) => ab.pitchZone !== undefined));
}
function hasPitchData(p: Player) {
  return p.pitchLocationStats.length > 0;
}
function hasAnyData(p: Player) {
  return hasHitZoneData(p) || hasPitchData(p);
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|\s]+/g, "_");
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

function fileNameFor(team: Team, p: Player) {
  return `${safeName(team.shortName ?? team.name)}_${p.number}_${safeName(p.name || "球员")}_热区图.pdf`;
}

// A4 landscape, one player per page. The page is filled with the app's own dark
// background so the card (which carries all the text, incl. Chinese — jsPDF's
// built-in fonts can't draw CJK) sits on it the same way it does on screen.
const PAGE_W = 297;
const PAGE_H = 210;
const PAGE_MARGIN = 10;
const PAGE_BG: [number, number, number] = [15, 23, 42];

function addCardPage(pdf: jsPDF, dataUrl: string, isFirst: boolean) {
  if (!isFirst) pdf.addPage("a4", "landscape");
  pdf.setFillColor(...PAGE_BG);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
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
  player, team, setRef,
}: {
  player: Player;
  team: Team;
  setRef: (el: HTMLDivElement | null) => void;
}) {
  const isPitcher = player.position === "P";
  const atBats = player.gameStats.flatMap((g) => g.atBats);
  const hits = atBats.filter((ab) => ["1B", "2B", "3B", "HR"].includes(ab.result)).length;
  const trueAB = trueAtBats(atBats);

  const hitBlock = hasHitZoneData(player) && (
    <div key="hit">
      <div className="text-sm font-semibold text-white mb-2">打击热区 Hit Zone</div>
      <HitZoneHeatMap gameStats={player.gameStats} isPitcher={isPitcher} prominentLabels />
    </div>
  );
  const pitchBlock = hasPitchData(player) && (
    <div key="pitch">
      <div className="text-sm font-semibold text-white mb-2">
        {isPitcher ? "投球位置 Pitch Locations" : "面对来球位置 Faced Pitches"}
      </div>
      <PitchZoneHeatMap stats={player.pitchLocationStats} isPitcher={isPitcher} prominentLabels />
    </div>
  );

  return (
    <div ref={setRef} style={{ width: 720, background: CARD_BG, padding: 20, borderRadius: 12 }}>
      <div className="flex items-baseline gap-3 flex-wrap mb-4">
        <span className="text-lg font-bold text-white">#{player.number} {player.name || "?"}</span>
        <span className="text-sm text-slate-300">{player.position}</span>
        <span className="text-sm text-slate-400">{team.name}</span>
        {trueAB > 0 && (
          <span className="text-sm text-slate-400 ml-auto">
            打击率 {(hits / trueAB).toFixed(3)}（{hits}/{trueAB}）
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
        {isPitcher ? [pitchBlock, hitBlock] : [hitBlock, pitchBlock]}
      </div>
    </div>
  );
}

export default function HeatmapExportPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    getTeams().then((t) => {
      setTeams(t);
      setLoading(false);
      const home = t.find((x) => x.name.includes("上海") || (x.shortName ?? "").includes("上海"));
      if (home) setTeamId(home.id);
    });
  }, []);

  const team = teams.find((t) => t.id === teamId) ?? null;
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
    return toPng(node, { pixelRatio: 3, backgroundColor: CARD_BG, cacheBust: true });
  }

  async function downloadOne(p: Player) {
    if (!team) return;
    setBusy(p.id);
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      addCardPage(pdf, await renderCard(p.id), true);
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
        addCardPage(pdf, await renderCard(selectedPlayers[i].id), i === 0);
      }
      triggerDownload(pdf.output("blob"), `${safeName(team.shortName ?? team.name)}_热区图.pdf`);
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
                <button
                  className="btn btn-primary text-sm ml-auto"
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
                      <span className="text-xs" style={{ color: "#64748b" }}>{ok ? p.position : "无数据"}</span>
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
                <PlayerHeatCard player={p} team={team} setRef={(el) => { cardRefs.current[p.id] = el; }} />
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
