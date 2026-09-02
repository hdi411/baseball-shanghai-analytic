"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTeams, createTeam, deleteTeam, initDefaultTeams } from "@/lib/store";
import type { Team } from "@/lib/types";

const TEAM_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444",
  "#a855f7", "#ec4899", "#06b6d4", "#f97316",
];

export default function HomePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newShort, setNewShort] = useState("");
  const [newColor, setNewColor] = useState(TEAM_COLORS[0]);
  const router = useRouter();

  useEffect(() => { initDefaultTeams(); setTeams(getTeams()); }, []);

  const filtered = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.shortName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createTeam(newName.trim(), newShort.trim() || undefined, newColor);
    setTeams(getTeams());
    setNewName(""); setNewShort(""); setNewColor(TEAM_COLORS[0]);
    setShowCreate(false);
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation();
    if (!confirm("刪除球隊？")) return;
    deleteTeam(id);
    setTeams(getTeams());
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
            <Link href="/upload" className="btn btn-ghost text-sm">
              ⬆ 上傳圖表
            </Link>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary text-sm">
              + 新增球隊
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* SEARCH */}
        <div className="mb-6">
          <input
            className="input text-base"
            style={{ maxWidth: 400 }}
            placeholder="🔍  搜尋球隊名稱..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* TEAMS GRID */}
        {filtered.length === 0 ? (
          <div className="text-center py-24" style={{ color: "#64748b" }}>
            {teams.length === 0 ? (
              <>
                <div className="text-6xl mb-4">⚾</div>
                <p className="text-xl mb-2">還沒有球隊</p>
                <p className="text-sm mb-6">點擊「新增球隊」開始建立你的球隊資料庫</p>
                <button onClick={() => setShowCreate(true)} className="btn btn-primary">
                  + 新增第一支球隊
                </button>
              </>
            ) : (
              <p>沒有符合「{search}」的球隊</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((team) => (
              <Link key={team.id} href={`/teams/${team.id}`} className="block">
                <div
                  className="card p-5 hover:border-green-500 transition-all cursor-pointer group relative"
                  style={{ borderColor: "#334155" }}
                >
                  <button
                    onClick={(e) => handleDelete(e, team.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 text-lg leading-none"
                    title="刪除球隊"
                  >×</button>

                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white"
                      style={{ background: team.color ?? "#22c55e" }}
                    >
                      {team.shortName ?? team.name.slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-semibold text-white text-base leading-tight">{team.name}</div>
                      {team.shortName && (
                        <div className="text-xs" style={{ color: "#64748b" }}>{team.shortName}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: "#94a3b8" }}>
                      {team.players.length} 位球員
                    </span>
                    <span className="text-xs" style={{ color: "#475569" }}>
                      {new Date(team.createdAt).toLocaleDateString("zh-TW")}
                    </span>
                  </div>

                  <div className="mt-3 h-1 rounded-full" style={{ background: "#334155" }}>
                    <div
                      className="h-1 rounded-full transition-all"
                      style={{
                        background: team.color ?? "#22c55e",
                        width: `${Math.min(100, (team.players.length / 15) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div className="card w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-5 text-white">新增球隊</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>球隊名稱 *</label>
                <input className="input" placeholder="虎鯨隊" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm mb-1" style={{ color: "#94a3b8" }}>縮寫（選填）</label>
                <input className="input" placeholder="虎鯨" maxLength={4} value={newShort} onChange={(e) => setNewShort(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-2" style={{ color: "#94a3b8" }}>球隊顏色</label>
                <div className="flex gap-2 flex-wrap">
                  {TEAM_COLORS.map((c) => (
                    <button
                      key={c} type="button"
                      onClick={() => setNewColor(c)}
                      className="w-8 h-8 rounded-full transition-all"
                      style={{
                        background: c,
                        outline: newColor === c ? `3px solid white` : "none",
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost flex-1">取消</button>
                <button type="submit" className="btn btn-primary flex-1">建立球隊</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
