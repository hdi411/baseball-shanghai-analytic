"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getTeam, deleteChart } from "@/lib/store";
import { getFile } from "@/lib/db";
import type { Team, Player, ChartFile, ChartCategory } from "@/lib/types";
import { CHART_TYPE_LABELS, CHART_TYPE_EN, CHART_CATEGORY } from "@/lib/types";

type Tab = "batting" | "pitching" | "scouting";

const TAB_LABELS: Record<Tab, string> = {
  batting: "打擊圖表",
  pitching: "投球圖表",
  scouting: "球探圖表",
};

export default function PlayerPage() {
  const params = useParams<{ id: string; playerId: string }>();
  const [team, setTeam] = useState<Team | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [tab, setTab] = useState<Tab>("batting");
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});
  const [viewingChart, setViewingChart] = useState<ChartFile | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);

  const reload = useCallback(() => {
    const t = getTeam(params.id);
    setTeam(t);
    const p = t?.players.find((p) => p.id === params.playerId) ?? null;
    setPlayer(p);
  }, [params.id, params.playerId]);

  useEffect(() => { reload(); }, [reload]);

  // Load PDF thumbnails for visible charts
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

  function handleDelete(chartId: string) {
    if (!confirm("刪除這張圖表？")) return;
    deleteChart(params.id, params.playerId, chartId);
    setViewingChart(null);
    setViewUrl(null);
    reload();
  }

  if (!team || !player) return null;

  const chartsForTab = player.charts.filter((c) => (CHART_CATEGORY[c.type] as ChartCategory) === tab);

  return (
    <div className="min-h-screen">
      {/* NAV */}
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
              <span className="font-semibold text-white">{player.name}</span>
            </div>
          </div>
          <Link href={`/upload?teamId=${team.id}&playerId=${player.id}`} className="btn btn-primary text-sm">
            + 上傳圖表
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* PLAYER HEADER */}
        <div className="card p-6 mb-6 flex flex-wrap gap-6 items-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
            style={{ background: team.color ?? "#22c55e" }}>
            #{player.number}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{player.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="badge text-white" style={{ background: "#334155" }}>{player.position}</span>
              {player.bats && <span className="text-sm" style={{ color: "#64748b" }}>打擊：{player.bats === "R" ? "右打" : player.bats === "L" ? "左打" : "兩打"}</span>}
              {player.throws && <span className="text-sm" style={{ color: "#64748b" }}>投球：{player.throws === "R" ? "右投" : "左投"}</span>}
            </div>
          </div>
          <div className="ml-auto flex gap-4">
            {(["batting","pitching","scouting"] as Tab[]).map((cat) => (
              <div key={cat} className="text-center">
                <div className="text-xl font-bold text-white">
                  {player.charts.filter(c => (CHART_CATEGORY[c.type] as ChartCategory) === cat).length}
                </div>
                <div className="text-xs" style={{ color: "#64748b" }}>{TAB_LABELS[cat]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="flex gap-2 mb-6 p-1 rounded-lg" style={{ background: "#1e293b", border: "1px solid #334155", width: "fit-content" }}>
          {(["batting","pitching","scouting"] as Tab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
              <span className="ml-1 text-xs opacity-70">
                ({player.charts.filter(c => (CHART_CATEGORY[c.type] as ChartCategory) === t).length})
              </span>
            </button>
          ))}
        </div>

        {/* CHARTS GRID */}
        {chartsForTab.length === 0 ? (
          <div className="text-center py-16" style={{ color: "#64748b" }}>
            <div className="text-5xl mb-3">📄</div>
            <p className="text-lg mb-1">尚無{TAB_LABELS[tab]}</p>
            <p className="text-sm mb-4">點擊右上角「上傳圖表」新增</p>
            <Link href={`/upload?teamId=${team.id}&playerId=${player.id}`} className="btn btn-primary inline-flex">
              上傳圖表
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {chartsForTab.map((chart) => (
              <div key={chart.id} className="card overflow-hidden group cursor-pointer" onClick={() => handleView(chart)}>
                {/* PDF preview */}
                <div className="h-40 relative" style={{ background: "#0f172a" }}>
                  {pdfUrls[chart.id] ? (
                    <iframe
                      src={pdfUrls[chart.id]}
                      className="w-full h-full border-0 pointer-events-none"
                      title={chart.fileName}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl" style={{ color: "#334155" }}>
                      📋
                    </div>
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
                    {new Date(chart.uploadedAt).toLocaleDateString("zh-TW")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PDF VIEWER MODAL */}
      {viewingChart && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(0,0,0,0.95)" }}>
          {/* Viewer header */}
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
              <button
                className="btn btn-danger text-sm"
                onClick={() => handleDelete(viewingChart.id)}
              >🗑 刪除</button>
              <button className="btn btn-ghost text-sm" onClick={() => { setViewingChart(null); setViewUrl(null); }}>✕ 關閉</button>
            </div>
          </div>
          {/* PDF */}
          <div className="flex-1 overflow-hidden">
            {viewUrl ? (
              <iframe src={viewUrl} className="w-full h-full border-0" title="PDF viewer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ color: "#64748b" }}>
                載入中...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
