"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getTeams, createTeam, addPlayer, addChart } from "@/lib/store";
import { saveFile } from "@/lib/db";
import type { Team, Player, ChartType, Position } from "@/lib/types";
import { CHART_TYPE_LABELS, CHART_TYPE_EN, POSITIONS } from "@/lib/types";

const CHART_TYPES: ChartType[] = [
  "pitcher-location",
  "pitcher-tendancy",
  "opponent-pitcher-tendancy",
  "hitter-tendancy",
];

const TEAM_COLORS = ["#22c55e","#3b82f6","#f59e0b","#ef4444","#a855f7","#ec4899","#06b6d4","#f97316"];

export default function UploadPageWrapper() {
  return (
    <Suspense>
      <UploadPage />
    </Suspense>
  );
}

function UploadPage() {
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [chartType, setChartType] = useState<ChartType>("pitcher-location");
  const [gameDate, setGameDate] = useState("");
  const [opponent, setOpponent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Create team inline
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamColor, setNewTeamColor] = useState(TEAM_COLORS[0]);

  // Create player inline
  const [showCreatePlayer, setShowCreatePlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerNum, setNewPlayerNum] = useState("");
  const [newPlayerPos, setNewPlayerPos] = useState<Position>("P");

  async function reload() {
    const t = await getTeams();
    setTeams(t);
    return t;
  }

  useEffect(() => {
    reload().then(t => {
      const preTeam = searchParams.get("teamId");
      const prePlayer = searchParams.get("playerId");
      if (preTeam && t.find(x => x.id === preTeam)) setSelectedTeamId(preTeam);
      if (prePlayer) setSelectedPlayerId(prePlayer);
    });
  }, []);

  const currentTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const currentPlayer = currentTeam?.players.find((p) => p.id === selectedPlayerId) ?? null;

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    const team = await createTeam(newTeamName.trim(), undefined, newTeamColor);
    await reload();
    setSelectedTeamId(team.id);
    setSelectedPlayerId("");
    setShowCreateTeam(false);
    setNewTeamName("");
  }

  async function handleCreatePlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlayerName.trim() || !selectedTeamId) return;
    const player = await addPlayer(selectedTeamId, { name: newPlayerName.trim(), number: newPlayerNum.trim(), position: newPlayerPos });
    await reload();
    setSelectedPlayerId(player.id);
    setShowCreatePlayer(false);
    setNewPlayerName(""); setNewPlayerNum(""); setNewPlayerPos("P");
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
    setFiles((prev) => [...prev, ...dropped]);
    setDone(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []).filter(f => f.type === "application/pdf");
    setFiles((prev) => [...prev, ...chosen]);
    setDone(false);
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeamId || !selectedPlayerId || files.length === 0) {
      setError("請選擇球隊、球員並至少上傳一個 PDF 檔案");
      return;
    }
    setError("");
    setUploading(true);
    try {
      for (const file of files) {
        const dataUrl = await fileToDataUrl(file);
        const chart = await addChart(selectedTeamId, selectedPlayerId, {
          type: chartType,
          fileName: file.name,
          gameDate: gameDate || undefined,
          opponent: opponent || undefined,
        });
        await saveFile(chart.id, dataUrl);
      }
      setDone(true);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError("上傳失敗，請重試");
      console.error(err);
    }
    setUploading(false);
  }

  return (
    <div className="min-h-screen">
      {/* NAV */}
      <nav style={{ background: "#1e293b", borderBottom: "1px solid #334155" }} className="sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={currentTeam ? `/teams/${currentTeam.id}` : "/"} className="btn btn-ghost text-sm px-3">← 返回</Link>
            <span className="text-2xl">⚾</span>
            <span className="font-semibold text-white">上傳圖表</span>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <form onSubmit={handleUpload} className="space-y-6">

          {/* STEP 1: Team */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-xs text-white font-bold">1</span>
                選擇球隊
              </h2>
              <button type="button" onClick={() => setShowCreateTeam(!showCreateTeam)} className="btn btn-ghost text-xs">
                + 新建球隊
              </button>
            </div>

            {showCreateTeam && (
              <div className="mb-4 p-4 rounded-lg" style={{ background: "#0f172a", border: "1px solid #334155" }}>
                <form onSubmit={handleCreateTeam} className="flex gap-2 flex-wrap">
                  <input className="input flex-1 text-sm" placeholder="球隊名稱" value={newTeamName} onChange={e => setNewTeamName(e.target.value)} required />
                  <div className="flex gap-1">
                    {TEAM_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setNewTeamColor(c)}
                        className="w-6 h-6 rounded-full"
                        style={{ background: c, outline: newTeamColor === c ? "2px solid white" : "none", outlineOffset: 1 }} />
                    ))}
                  </div>
                  <button type="submit" className="btn btn-primary text-sm">建立</button>
                </form>
              </div>
            )}

            <select className="input select" value={selectedTeamId}
              onChange={(e) => { setSelectedTeamId(e.target.value); setSelectedPlayerId(""); }}>
              <option value="">— 選擇球隊 —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* STEP 2: Player */}
          <div className="card p-5" style={{ opacity: selectedTeamId ? 1 : 0.4, pointerEvents: selectedTeamId ? "auto" : "none" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-xs text-white font-bold">2</span>
                選擇球員
              </h2>
              <button type="button" onClick={() => setShowCreatePlayer(!showCreatePlayer)} className="btn btn-ghost text-xs" disabled={!selectedTeamId}>
                + 新建球員
              </button>
            </div>

            {showCreatePlayer && (
              <div className="mb-4 p-4 rounded-lg" style={{ background: "#0f172a", border: "1px solid #334155" }}>
                <form onSubmit={handleCreatePlayer} className="flex gap-2 flex-wrap">
                  <input className="input text-sm" style={{ width: 120 }} placeholder="姓名" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} required />
                  <input className="input text-sm" style={{ width: 70 }} placeholder="背號" value={newPlayerNum} onChange={e => setNewPlayerNum(e.target.value)} />
                  <select className="input select text-sm" style={{ width: 80 }} value={newPlayerPos} onChange={e => setNewPlayerPos(e.target.value as Position)}>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button type="submit" className="btn btn-primary text-sm">建立</button>
                </form>
              </div>
            )}

            <select className="input select" value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)} disabled={!selectedTeamId}>
              <option value="">— 選擇球員 —</option>
              {currentTeam?.players.map((p) => (
                <option key={p.id} value={p.id}>#{p.number} {p.name} ({p.position})</option>
              ))}
            </select>
          </div>

          {/* STEP 3: Chart type + metadata */}
          <div className="card p-5" style={{ opacity: selectedPlayerId ? 1 : 0.4, pointerEvents: selectedPlayerId ? "auto" : "none" }}>
            <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-xs text-white font-bold">3</span>
              圖表資訊
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>圖表類型</label>
                <select className="input select" value={chartType} onChange={(e) => setChartType(e.target.value as ChartType)}>
                  {CHART_TYPES.map((t) => (
                    <option key={t} value={t}>{CHART_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <div className="text-xs mt-1" style={{ color: "#64748b" }}>{CHART_TYPE_EN[chartType]}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>比賽日期（選填）</label>
                  <input className="input" type="date" value={gameDate} onChange={(e) => setGameDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>對手（選填）</label>
                  <input className="input" placeholder="海俠隊" value={opponent} onChange={(e) => setOpponent(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* STEP 4: File upload */}
          <div className="card p-5" style={{ opacity: selectedPlayerId ? 1 : 0.4, pointerEvents: selectedPlayerId ? "auto" : "none" }}>
            <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-xs text-white font-bold">4</span>
              上傳 PDF 檔案
            </h2>

            <div
              className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-8 cursor-pointer transition-colors"
              style={{ borderColor: files.length > 0 ? "#22c55e" : "#334155", background: "#0f172a" }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="application/pdf" multiple hidden onChange={handleFileChange} />
              <div className="text-4xl mb-3">📂</div>
              <p className="text-sm text-center" style={{ color: "#94a3b8" }}>
                拖放 PDF 到這裡，或<span className="text-green-400 underline ml-1">點擊選擇檔案</span>
              </p>
              <p className="text-xs mt-1" style={{ color: "#64748b" }}>支援多檔案上傳</p>
            </div>

            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "#0f172a", border: "1px solid #334155" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📋</span>
                      <div>
                        <div className="text-sm text-white truncate max-w-xs">{f.name}</div>
                        <div className="text-xs" style={{ color: "#64748b" }}>{(f.size / 1024).toFixed(0)} KB</div>
                      </div>
                    </div>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-300 text-lg leading-none ml-2">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ERROR */}
          {error && (
            <div className="text-sm text-red-400 px-1">{error}</div>
          )}

          {/* SUCCESS */}
          {done && (
            <div className="card p-4 flex items-center gap-3" style={{ borderColor: "#22c55e" }}>
              <span className="text-2xl">✅</span>
              <div>
                <div className="font-medium text-white">上傳成功！</div>
                <div className="text-sm" style={{ color: "#64748b" }}>
                  圖表已儲存到{" "}
                  <Link href={`/teams/${selectedTeamId}/${selectedPlayerId}`} className="text-green-400 underline">
                    {currentPlayer?.name} 的資料頁
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* SUBMIT */}
          <button
            type="submit"
            className="btn btn-primary w-full py-3 text-base justify-center"
            disabled={uploading || !selectedTeamId || !selectedPlayerId || files.length === 0}
            style={{ opacity: (!selectedTeamId || !selectedPlayerId || files.length === 0) ? 0.5 : 1 }}
          >
            {uploading ? "上傳中..." : `上傳 ${files.length > 0 ? files.length + " 個" : ""}PDF 圖表`}
          </button>

          <div className="text-center">
            <Link href="/" className="text-sm" style={{ color: "#64748b" }}>← 返回球隊列表</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
