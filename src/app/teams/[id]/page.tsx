"use client";
import { useEffect, useState } from "react";
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

export default function TeamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", number: "", position: "P" as Position, bats: "R" as "R"|"L"|"S", throws: "R" as "R"|"L" });

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
    if (!confirm("刪除球員？")) return;
    deletePlayer(params.id, playerId);
    reload();
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
            <Link href={`/upload?teamId=${team.id}`} className="btn btn-ghost text-sm">⬆ 上傳圖表</Link>
            <button onClick={() => setShowAdd(true)} className="btn btn-primary text-sm">+ 新增球員</button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* STATS ROW */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "球員人數", value: team.players.length },
            { label: "投手", value: team.players.filter(p => p.position === "P").length },
            { label: "已上傳圖表", value: totalCharts },
          ].map((s) => (
            <div key={s.label} className="card p-4 text-center">
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs mt-1" style={{ color: "#64748b" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* SEARCH */}
        <div className="mb-6">
          <input
            className="input"
            style={{ maxWidth: 400 }}
            placeholder="🔍  搜尋球員姓名、背號、守備位置..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* PLAYERS */}
        {filtered.length === 0 ? (
          <div className="text-center py-16" style={{ color: "#64748b" }}>
            {team.players.length === 0 ? (
              <>
                <div className="text-5xl mb-3">👤</div>
                <p className="text-lg mb-1">還沒有球員</p>
                <p className="text-sm mb-4">點擊「新增球員」加入球員資料</p>
                <button onClick={() => setShowAdd(true)} className="btn btn-primary">+ 新增第一位球員</button>
              </>
            ) : <p>沒有符合「{search}」的球員</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((player) => (
              <Link key={player.id} href={`/teams/${team.id}/${player.id}`} className="block">
                <div className="card p-4 hover:border-green-500 transition-all cursor-pointer group relative">
                  <button
                    onClick={(e) => handleDelete(e, player.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 text-lg leading-none"
                  >×</button>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm"
                      style={{ background: POSITION_COLORS[player.position] ?? "#64748b" }}>
                      #{player.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate">{player.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="badge text-white text-xs" style={{ background: POSITION_COLORS[player.position] ?? "#64748b" }}>
                          {player.position}
                        </span>
                        {player.bats && <span className="text-xs" style={{ color: "#64748b" }}>打:{player.bats}</span>}
                        {player.throws && <span className="text-xs" style={{ color: "#64748b" }}>投:{player.throws}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-xs" style={{ color: "#64748b" }}>
                      {player.charts.length > 0 ? `${player.charts.length} 張圖表` : "尚無圖表"}
                    </span>
                    {player.charts.length > 0 && (
                      <div className="flex gap-1">
                        {["batting","pitching","scouting"].map((cat) => {
                          const n = player.charts.filter(c => {
                            if (cat === "batting") return c.type === "hitter-tendancy";
                            if (cat === "pitching") return c.type === "pitcher-location" || c.type === "pitcher-tendancy";
                            return c.type === "opponent-pitcher-tendancy";
                          }).length;
                          if (!n) return null;
                          return <span key={cat} className="badge" style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8" }}>{n}</span>;
                        })}
                      </div>
                    )}
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
            <h2 className="text-lg font-bold mb-5 text-white">新增球員</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>姓名 *</label>
                  <input className="input" placeholder="張大郎" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>背號</label>
                  <input className="input" placeholder="23" value={form.number} onChange={(e) => setForm({...form, number: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>守備位置</label>
                <select className="input select" value={form.position} onChange={(e) => setForm({...form, position: e.target.value as Position})}>
                  {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>打擊慣用手</label>
                  <select className="input select" value={form.bats} onChange={(e) => setForm({...form, bats: e.target.value as "R"|"L"|"S"})}>
                    <option value="R">右打 R</option>
                    <option value="L">左打 L</option>
                    <option value="S">兩打 S</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>投球慣用手</label>
                  <select className="input select" value={form.throws} onChange={(e) => setForm({...form, throws: e.target.value as "R"|"L"})}>
                    <option value="R">右投 R</option>
                    <option value="L">左投 L</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="btn btn-ghost flex-1">取消</button>
                <button type="submit" className="btn btn-primary flex-1">新增球員</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
