"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getTeams, initDefaultTeams } from "@/lib/store";
import type { Team } from "@/lib/types";

export default function HomePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    initDefaultTeams();
    getTeams().then(setTeams);
  }, []);

  const filtered = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.shortName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen">
      <nav style={{ background: "#1e293b", borderBottom: "1px solid #334155" }} className="sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          <span className="text-2xl mr-2">⚾</span>
          <span className="font-bold text-lg text-white">Baseball Analytics</span>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <input className="input text-base" style={{ maxWidth: 400 }}
            placeholder="🔍  搜索球队名称..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-24" style={{ color: "#64748b" }}>
            {teams.length === 0
              ? <><div className="text-6xl mb-4">⚾</div><p className="text-xl">暂无球队数据</p></>
              : <p>没有符合「{search}」的球队</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((team) => (
              <Link key={team.id} href={`/teams/${team.id}`} className="block">
                <div className="card p-5 hover:border-green-500 transition-all cursor-pointer">
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
                    <div className="h-1 rounded-full" style={{ background: team.color ?? "#22c55e", width: `${Math.min(100, (team.players.length / 15) * 100)}%` }} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
