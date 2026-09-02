"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTeams, createTeam, deleteTeam, initDefaultTeams, addPlayer, addGameStat } from "@/lib/store";
import type { Team, AtBat } from "@/lib/types";

const TEAM_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444",
  "#a855f7", "#ec4899", "#06b6d4", "#f97316",
];

interface ParsedPlayer {
  battingOrder: number;
  name: string;
  number: string;
  atBats: AtBat[];
  selected: boolean;
}

export default function HomePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newShort, setNewShort] = useState("");
  const [newColor, setNewColor] = useState(TEAM_COLORS[0]);
  const router = useRouter();

  // Smart import state
  const [showImport, setShowImport] = useState(false);
  const [importTeamId, setImportTeamId] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDate, setImportDate] = useState("");
  const [importOpponent, setImportOpponent] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedPlayers, setParsedPlayers] = useState<ParsedPlayer[]>([]);
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    initDefaultTeams();
    const t = getTeams();
    setTeams(t);
    return t;
  }

  useEffect(() => { reload(); }, []);

  const filtered = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.shortName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createTeam(newName.trim(), newShort.trim() || undefined, newColor);
    reload();
    setNewName(""); setNewShort(""); setNewColor(TEAM_COLORS[0]);
    setShowCreate(false);
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("删除球队？")) return;
    deleteTeam(id);
    reload();
  }

  function openImport() {
    setShowImport(true);
    setImportTeamId("");
    setImportFile(null);
    setParsedPlayers([]);
    setParseError("");
    setImportDone(false);
    setImportDate("");
    setImportOpponent("");
  }

  async function handleParse() {
    if (!importFile || !importTeamId) return;
    setParsing(true);
    setParseError("");
    setParsedPlayers([]);
    try {
      const fd = new FormData();
      fd.append("pdf", importFile);
      const res = await fetch("/api/parse-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const team = teams.find(t => t.id === importTeamId);
      const existing = new Set(team?.players.map(p => p.name) ?? []);
      setParsedPlayers(
        (data.players as { battingOrder: number; name: string; number: string; atBats: AtBat[] }[])
          .filter(p => p.name)
          .map(p => ({ ...p, atBats: p.atBats ?? [], selected: !existing.has(p.name) }))
      );
    } catch (err) {
      setParseError("解析失败，请重试");
      console.error(err);
    }
    setParsing(false);
  }

  async function handleImport() {
    if (!importTeamId) return;
    setImporting(true);
    const team = getTeams().find(t => t.id === importTeamId);
    const currentPlayers = team?.players ?? [];
    for (const p of parsedPlayers.filter(p => p.selected)) {
      const existing = currentPlayers.find(ep => ep.name === p.name);
      let playerId: string;
      if (existing) {
        playerId = existing.id;
      } else {
        const newP = addPlayer(importTeamId, { name: p.name, number: p.number, position: "P" });
        playerId = newP.id;
      }
      if (p.atBats && p.atBats.length > 0 && (importDate || importOpponent)) {
        addGameStat(importTeamId, playerId, {
          gameDate: importDate,
          opponent: importOpponent,
          battingOrder: p.battingOrder,
          atBats: p.atBats,
        });
      }
    }
    reload();
    setImportDone(true);
    setImporting(false);
    setTimeout(() => setShowImport(false), 1500);
  }

  return (
    <div className="min-h-screen">
      {/* NAV */}
      <nav style={{ background: "#1e293b", borderBottom: "1px solid #334155" }} className="sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚾</span>
            <span className="font-bold text-lg text-white">Baseball Analytics</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/upload" className="btn btn-ghost text-sm">⬆ 上传图表</Link>
            <button onClick={openImport} className="btn btn-ghost text-sm">🤖 智能导入</button>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary text-sm">+ 新增球队</button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* SEARCH */}
        <div className="mb-6">
          <input className="input text-base" style={{ maxWidth: 400 }}
            placeholder="🔍  搜索球队名称..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* TEAMS GRID */}
        {filtered.length === 0 ? (
          <div className="text-center py-24" style={{ color: "#64748b" }}>
            {teams.length === 0 ? (
              <>
                <div className="text-6xl mb-4">⚾</div>
                <p className="text-xl mb-2">还没有球队</p>
                <p className="text-sm mb-6">点击「新增球队」开始建立球队数据库</p>
                <button onClick={() => setShowCreate(true)} className="btn btn-primary">+ 新增第一支球队</button>
              </>
            ) : <p>没有符合「{search}」的球队</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((team) => (
              <Link key={team.id} href={`/teams/${team.id}`} className="block">
                <div className="card p-5 hover:border-green-500 transition-all cursor-pointer group relative" style={{ borderColor: "#334155" }}>
                  <button onClick={(e) => handleDelete(e, team.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 text-lg leading-none"
                    title="删除球队">×</button>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white"
                      style={{ background: team.color ?? "#22c55e" }}>
                      {team.shortName ?? team.name.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-semibold text-white text-base leading-tight">{team.name}</div>
                      {team.shortName && <div className="text-xs" style={{ color: "#64748b" }}>{team.shortName}</div>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: "#94a3b8" }}>{team.players.length} 位球员</span>
                    <span className="text-xs" style={{ color: "#475569" }}>{new Date(team.createdAt).toLocaleDateString("zh-CN")}</span>
                  </div>
                  <div className="mt-3 h-1 rounded-full" style={{ background: "#334155" }}>
                    <div className="h-1 rounded-full transition-all"
                      style={{ background: team.color ?? "#22c55e", width: `${Math.min(100, (team.players.length / 15) * 100)}%` }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="card w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-5 text-white">新增球队</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>球队名称 *</label>
                <input className="input" placeholder="虎鲸队" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>缩写（选填）</label>
                <input className="input" placeholder="虎鲸" maxLength={4} value={newShort} onChange={(e) => setNewShort(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-2" style={{ color: "#94a3b8" }}>球队颜色</label>
                <div className="flex gap-2 flex-wrap">
                  {TEAM_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setNewColor(c)}
                      className="w-8 h-8 rounded-full transition-all"
                      style={{ background: c, outline: newColor === c ? "3px solid white" : "none", outlineOffset: 2 }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost flex-1">取消</button>
                <button type="submit" className="btn btn-primary flex-1">建立球队</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SMART IMPORT MODAL */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowImport(false); }}>
          <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">🤖 智能导入球员</h2>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>

            {importDone ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">✅</div>
                <p className="text-white font-medium">导入成功！</p>
              </div>
            ) : parsedPlayers.length > 0 ? (
              <>
                {/* Game metadata */}
                <div className="grid grid-cols-2 gap-3 mb-4 p-3 rounded-lg" style={{ background: "#0f172a", border: "1px solid #334155" }}>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: "#94a3b8" }}>比赛日期（选填）</label>
                    <input className="input text-sm" type="date" value={importDate} onChange={e => setImportDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: "#94a3b8" }}>对手球队（选填）</label>
                    <input className="input text-sm" placeholder="上海虎鲸" value={importOpponent} onChange={e => setImportOpponent(e.target.value)} />
                  </div>
                </div>

                <p className="text-sm mb-3" style={{ color: "#94a3b8" }}>
                  从 PDF 中识别到以下球员，勾选要导入的：
                </p>
                <div className="space-y-2 mb-5 max-h-64 overflow-y-auto">
                  {parsedPlayers.map((p, i) => {
                    const team = teams.find(t => t.id === importTeamId);
                    const exists = team?.players.find(ep => ep.name === p.name);
                    return (
                      <label key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer"
                        style={{ background: "#0f172a", border: "1px solid #334155" }}>
                        <input type="checkbox" checked={p.selected}
                          onChange={() => setParsedPlayers(prev => prev.map((x, j) => j === i ? {...x, selected: !x.selected} : x))}
                          className="w-4 h-4 accent-green-500" />
                        <span className="text-sm font-medium text-white">
                          {p.battingOrder}棒 · #{p.number} {p.name}
                        </span>
                        {exists && <span className="text-xs ml-auto" style={{ color: "#64748b" }}>已存在</span>}
                      </label>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setParsedPlayers([]); setImportFile(null); }} className="btn btn-ghost flex-1">重新上传</button>
                  <button onClick={handleImport} disabled={importing || parsedPlayers.every(p => !p.selected)}
                    className="btn btn-primary flex-1">
                    {importing ? "导入中..." : `导入 ${parsedPlayers.filter(p => p.selected).length} 位球员`}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Step 1: Select team */}
                <div className="mb-4">
                  <label className="block text-sm mb-2" style={{ color: "#94a3b8" }}>选择球队 *</label>
                  <select className="input select" value={importTeamId} onChange={e => setImportTeamId(e.target.value)}>
                    <option value="">— 选择球队 —</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>

                {/* Step 2: Upload PDF */}
                <div
                  className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-8 cursor-pointer mb-4"
                  style={{ borderColor: importFile ? "#22c55e" : "#334155", background: "#0f172a", opacity: importTeamId ? 1 : 0.4, pointerEvents: importTeamId ? "auto" : "none" }}
                  onClick={() => fileRef.current?.click()}>
                  <input ref={fileRef} type="file" accept="application/pdf" hidden
                    onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setParseError(""); }} />
                  <div className="text-4xl mb-2">📋</div>
                  {importFile
                    ? <p className="text-sm text-green-400 font-medium">{importFile.name}</p>
                    : <p className="text-sm" style={{ color: "#94a3b8" }}>点击选择「投球位置首球好球记录表」PDF</p>}
                </div>

                {parseError && <p className="text-red-400 text-sm mb-3">{parseError}</p>}

                <button onClick={handleParse} disabled={!importFile || !importTeamId || parsing}
                  className="btn btn-primary w-full justify-center"
                  style={{ opacity: (!importFile || !importTeamId) ? 0.5 : 1 }}>
                  {parsing ? "🤖 AI 识别中..." : "🤖 开始智能识别"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
