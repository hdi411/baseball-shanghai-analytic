"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { getTeam, addPlayer, deletePlayer } from "@/lib/store";
import type { Team, Player, Position } from "@/lib/types";
import { POSITIONS } from "@/lib/types";

const POSITION_COLORS: Record<string, string> = {
  P: "#3b82f6", C: "#8b5cf6", "1B": "#f59e0b", "2B": "#f59e0b",
  "3B": "#f59e0b", SS: "#f59e0b", LF: "#22c55e", CF: "#22c55e",
  RF: "#22c55e", DH: "#ef4444", OF: "#22c55e", INF: "#f59e0b",
};

interface ParsedPlayer {
  battingOrder: number;
  name: string;
  number: string;
  selected: boolean;
}

export default function TeamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", number: "", position: "P" as Position, bats: "R" as "R"|"L"|"S", throws: "R" as "R"|"L" });

  // Smart import state
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedPlayers, setParsedPlayers] = useState<ParsedPlayer[]>([]);
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    const t = getTeam(params.id);
    setTeam(t);
    if (!t) router.push("/");
  }

  useEffect(() => { reload(); }, [params.id]);

  const filtered = (team?.players ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.number.includes(search) ||
    p.position.toLowerCase().includes(search.toLowerCase())
  );

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    addPlayer(params.id, { name: form.name.trim(), number: form.number.trim(), position: form.position, throws: form.throws, bats: form.bats });
    reload();
    setShowAdd(false);
    setForm({ name: "", number: "", position: "P", bats: "R", throws: "R" });
  }

  function handleDelete(e: React.MouseEvent, playerId: string) {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("删除球员？")) return;
    deletePlayer(params.id, playerId);
    reload();
  }

  async function handleParse() {
    if (!importFile) return;
    setParsing(true);
    setParseError("");
    setParsedPlayers([]);
    try {
      const fd = new FormData();
      fd.append("pdf", importFile);
      const res = await fetch("/api/parse-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const existing = new Set(team?.players.map(p => p.name) ?? []);
      setParsedPlayers(
        (data.players as { battingOrder: number; name: string; number: string }[])
          .filter(p => p.name && !existing.has(p.name))
          .map(p => ({ ...p, selected: true }))
      );
    } catch (err) {
      setParseError("解析失败，请重试");
      console.error(err);
    }
    setParsing(false);
  }

  async function handleImport() {
    setImporting(true);
    for (const p of parsedPlayers.filter(p => p.selected)) {
      addPlayer(params.id, { name: p.name, number: p.number, position: "P" });
    }
    reload();
    setImportDone(true);
    setImporting(false);
    setTimeout(() => {
      setShowImport(false);
      setImportFile(null);
      setParsedPlayers([]);
      setImportDone(false);
    }, 1500);
  }

  function resetImport() {
    setImportFile(null);
    setParsedPlayers([]);
    setParseError("");
    setImportDone(false);
  }

  if (!team) return null;

  const totalCharts = team.players.reduce((s, p) => s + p.charts.length, 0);

  return (
    <div className="min-h-screen">
      {/* NAV */}
      <nav style={{ background: "#1e293b", borderBottom: "1px solid #334155" }} className="sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="btn btn-ghost text-sm px-3">← 返回</Link>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white"
                style={{ background: team.color ?? "#22c55e" }}>
                {team.shortName ?? team.name.slice(0,2)}
              </div>
              <span className="font-semibold text-white">{team.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/upload?teamId=${team.id}`} className="btn btn-ghost text-sm">⬆ 上传图表</Link>
            <button onClick={() => { setShowImport(true); resetImport(); }} className="btn btn-ghost text-sm">🤖 智能导入</button>
            <button onClick={() => setShowAdd(true)} className="btn btn-primary text-sm">+ 添加球员</button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* STATS */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "球员人数", value: team.players.length },
            { label: "投手", value: team.players.filter(p => p.position === "P").length },
            { label: "已上传图表", value: totalCharts },
          ].map((s) => (
            <div key={s.label} className="card p-4 text-center">
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs mt-1" style={{ color: "#64748b" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* SEARCH */}
        <div className="mb-6">
          <input className="input" style={{ maxWidth: 400 }}
            placeholder="🔍  搜索球员姓名、背号、守备位置..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* PLAYERS */}
        {filtered.length === 0 ? (
          <div className="text-center py-16" style={{ color: "#64748b" }}>
            {team.players.length === 0 ? (
              <>
                <div className="text-5xl mb-3">👤</div>
                <p className="text-lg mb-1">还没有球员</p>
                <p className="text-sm mb-4">上传记录表 PDF 智能导入，或手动添加</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => { setShowImport(true); resetImport(); }} className="btn btn-primary">🤖 智能导入</button>
                  <button onClick={() => setShowAdd(true)} className="btn btn-ghost">+ 手动添加</button>
                </div>
              </>
            ) : <p>没有符合「{search}」的球员</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((player) => (
              <Link key={player.id} href={`/teams/${team.id}/${player.id}`} className="block">
                <div className="card p-4 hover:border-green-500 transition-all cursor-pointer group relative">
                  <button onClick={(e) => handleDelete(e, player.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 text-lg leading-none">×</button>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm"
                      style={{ background: POSITION_COLORS[player.position] ?? "#64748b" }}>
                      #{player.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate">{player.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="badge text-white text-xs" style={{ background: POSITION_COLORS[player.position] ?? "#64748b" }}>{player.position}</span>
                        {player.bats && <span className="text-xs" style={{ color: "#64748b" }}>打:{player.bats}</span>}
                        {player.throws && <span className="text-xs" style={{ color: "#64748b" }}>投:{player.throws}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs" style={{ color: "#64748b" }}>
                    {player.charts.length > 0 ? `${player.charts.length} 张图表` : "暂无图表"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ADD PLAYER MODAL */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="card w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-5 text-white">添加球员</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>姓名 *</label>
                  <input className="input" placeholder="张大郎" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>背号</label>
                  <input className="input" placeholder="23" value={form.number} onChange={(e) => setForm({...form, number: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>守备位置</label>
                <select className="input select" value={form.position} onChange={(e) => setForm({...form, position: e.target.value as Position})}>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>打击惯用手</label>
                  <select className="input select" value={form.bats} onChange={(e) => setForm({...form, bats: e.target.value as "R"|"L"|"S"})}>
                    <option value="R">右打 R</option><option value="L">左打 L</option><option value="S">两打 S</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>投球惯用手</label>
                  <select className="input select" value={form.throws} onChange={(e) => setForm({...form, throws: e.target.value as "R"|"L"})}>
                    <option value="R">右投 R</option><option value="L">左投 L</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="btn btn-ghost flex-1">取消</button>
                <button type="submit" className="btn btn-primary flex-1">添加球员</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SMART IMPORT MODAL */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowImport(false); }}>
          <div className="card w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">🤖 智能导入球员</h2>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>

            {importDone ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">✅</div>
                <p className="text-white font-medium">导入成功！</p>
              </div>
            ) : parsedPlayers.length > 0 ? (
              <>
                <p className="text-sm mb-4" style={{ color: "#94a3b8" }}>
                  从 PDF 中识别到以下球员，已过滤已存在的，勾选要导入的：
                </p>
                <div className="space-y-2 mb-5 max-h-72 overflow-y-auto">
                  {parsedPlayers.map((p, i) => (
                    <label key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer"
                      style={{ background: "#0f172a", border: "1px solid #334155" }}>
                      <input type="checkbox" checked={p.selected}
                        onChange={() => setParsedPlayers(prev => prev.map((x, j) => j === i ? {...x, selected: !x.selected} : x))}
                        className="w-4 h-4 accent-green-500" />
                      <span className="text-sm font-medium text-white">
                        {p.battingOrder}棒 · #{p.number} {p.name}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={resetImport} className="btn btn-ghost flex-1">重新上传</button>
                  <button onClick={handleImport} disabled={importing || parsedPlayers.every(p => !p.selected)}
                    className="btn btn-primary flex-1">
                    {importing ? "导入中..." : `导入 ${parsedPlayers.filter(p => p.selected).length} 位球员`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm mb-4" style={{ color: "#94a3b8" }}>
                  上传「投球位置首球好球记录表」PDF，AI 自动识别球员姓名和背号
                </p>
                <div
                  className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-8 cursor-pointer mb-4"
                  style={{ borderColor: importFile ? "#22c55e" : "#334155", background: "#0f172a" }}
                  onClick={() => fileRef.current?.click()}>
                  <input ref={fileRef} type="file" accept="application/pdf" hidden
                    onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setParseError(""); }} />
                  <div className="text-4xl mb-2">📋</div>
                  {importFile ? (
                    <p className="text-sm text-green-400 font-medium">{importFile.name}</p>
                  ) : (
                    <p className="text-sm" style={{ color: "#94a3b8" }}>点击选择 PDF 文件</p>
                  )}
                </div>
                {parseError && <p className="text-red-400 text-sm mb-3">{parseError}</p>}
                <button onClick={handleParse} disabled={!importFile || parsing}
                  className="btn btn-primary w-full justify-center"
                  style={{ opacity: !importFile ? 0.5 : 1 }}>
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
