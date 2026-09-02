// localStorage wrapper for team/player metadata (no large binary)
import type { Team, Player, ChartFile, GameStat, Position } from "./types";

const KEY = "baseball_teams_v1";

const DEFAULT_TEAMS: Omit<Team, "id" | "players" | "createdAt">[] = [
  { name: "北京正大龙棒球俱乐部", shortName: "正大龙", color: "#ef4444" },
  { name: "上海虎鲸棒球俱乐部",   shortName: "虎鲸",  color: "#3b82f6" },
  { name: "深圳蓝袜棒球俱乐部",   shortName: "蓝袜",  color: "#06b6d4" },
  { name: "厦门海豚棒球俱乐部",   shortName: "海豚",  color: "#a855f7" },
  { name: "福州海侠（海峡）棒球俱乐部", shortName: "海侠", color: "#22c55e" },
  { name: "长沙旺旺棒球俱乐部",   shortName: "旺旺",  color: "#f59e0b" },
];

export function getTeams(): Team[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTeams(teams: Team[]) {
  localStorage.setItem(KEY, JSON.stringify(teams));
}

const DEFAULT_PLAYERS: Record<string, { name: string; number: string }[]> = {
  "虎鲸": [
    { name: "", number: "23" },
    { name: "", number: "53" },
    { name: "", number: "37" },
    { name: "", number: "31" },
    { name: "", number: "89" },
    { name: "", number: "3"  },
    { name: "", number: "22" },
    { name: "", number: "6"  },
    { name: "", number: "7"  },
  ],
  "海侠": [
    { name: "", number: "5"  },
    { name: "", number: "14" },
    { name: "", number: "6"  },
    { name: "", number: "0"  },
    { name: "", number: "29" },
    { name: "", number: "55" },
    { name: "", number: "93" },
    { name: "", number: "68" },
    { name: "", number: "30" },
  ],
};

function makeDefaultPlayers(shortName?: string): Player[] {
  const list = (shortName && DEFAULT_PLAYERS[shortName]) ?? [];
  return list.map((p) => ({
    ...p,
    id: crypto.randomUUID(),
    position: "OF" as Position,
    charts: [],
    gameStats: [],
  }));
}

export function initDefaultTeams(): void {
  if (getTeams().length > 0) {
    // Migration: seed players into existing empty teams
    seedDefaultPlayers();
    return;
  }
  const teams: Team[] = DEFAULT_TEAMS.map((t) => ({
    ...t,
    id: crypto.randomUUID(),
    players: makeDefaultPlayers(t.shortName),
    createdAt: new Date().toISOString(),
  }));
  saveTeams(teams);
}

export function seedDefaultPlayers(): void {
  const teams = getTeams();
  let changed = false;
  for (const team of teams) {
    const key = team.shortName;
    if (key && DEFAULT_PLAYERS[key] && team.players.length === 0) {
      team.players = makeDefaultPlayers(key);
      changed = true;
    }
  }
  if (changed) saveTeams(teams);
}

export function getTeam(id: string): Team | null {
  return getTeams().find((t) => t.id === id) ?? null;
}

export function createTeam(name: string, shortName?: string, color?: string): Team {
  const team: Team = {
    id: crypto.randomUUID(),
    name,
    shortName,
    color: color ?? "#22c55e",
    players: [],
    createdAt: new Date().toISOString(),
  };
  const teams = getTeams();
  teams.push(team);
  saveTeams(teams);
  return team;
}

export function updateTeam(updated: Team): void {
  const teams = getTeams();
  const i = teams.findIndex((t) => t.id === updated.id);
  if (i !== -1) { teams[i] = updated; saveTeams(teams); }
}

export function deleteTeam(id: string): void {
  saveTeams(getTeams().filter((t) => t.id !== id));
}

export function addPlayer(
  teamId: string,
  data: { name: string; number: string; position: Position; throws?: "R" | "L"; bats?: "R" | "L" | "S" }
): Player {
  const teams = getTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) throw new Error("Team not found");
  const player: Player = { ...data, id: crypto.randomUUID(), charts: [], gameStats: [] };
  team.players.push(player);
  saveTeams(teams);
  return player;
}

export function deletePlayer(teamId: string, playerId: string): void {
  const teams = getTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;
  team.players = team.players.filter((p) => p.id !== playerId);
  saveTeams(teams);
}

export function addChart(
  teamId: string,
  playerId: string,
  chart: Omit<ChartFile, "id" | "uploadedAt">
): ChartFile {
  const teams = getTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) throw new Error("Team not found");
  const player = team.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  const newChart: ChartFile = {
    ...chart,
    id: crypto.randomUUID(),
    uploadedAt: new Date().toISOString(),
  };
  player.charts.push(newChart);
  saveTeams(teams);
  return newChart;
}

export function deleteChart(teamId: string, playerId: string, chartId: string): void {
  const teams = getTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;
  const player = team.players.find((p) => p.id === playerId);
  if (!player) return;
  player.charts = player.charts.filter((c) => c.id !== chartId);
  saveTeams(teams);
}

export function addGameStat(
  teamId: string,
  playerId: string,
  stat: Omit<GameStat, "id" | "uploadedAt">
): GameStat {
  const teams = getTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) throw new Error("Team not found");
  const player = team.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  if (!player.gameStats) player.gameStats = [];
  const newStat: GameStat = {
    ...stat,
    id: crypto.randomUUID(),
    uploadedAt: new Date().toISOString(),
  };
  player.gameStats.push(newStat);
  saveTeams(teams);
  return newStat;
}

export function deleteGameStat(teamId: string, playerId: string, statId: string): void {
  const teams = getTeams();
  const team = teams.find((t) => t.id === teamId);
  if (!team) return;
  const player = team.players.find((p) => p.id === playerId);
  if (!player) return;
  player.gameStats = (player.gameStats ?? []).filter((s) => s.id !== statId);
  saveTeams(teams);
}
