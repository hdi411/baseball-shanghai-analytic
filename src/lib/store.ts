// localStorage wrapper for team/player metadata (no large binary)
import type { Team, Player, ChartFile, Position } from "./types";

const KEY = "baseball_teams_v1";

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
  const player: Player = { ...data, id: crypto.randomUUID(), charts: [] };
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
