// Supabase-backed store — replaces localStorage version
import { createClient } from "@supabase/supabase-js";
import type { Team, Player, ChartFile, GameStat, Position } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const db = createClient(supabaseUrl, supabaseKey);

// ─── helpers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPlayer(row: any, stats: GameStat[] = [], charts: ChartFile[] = []): Player {
  return {
    id:       row.id,
    name:     row.name ?? "",
    number:   row.number ?? "",
    position: (row.position as Position) ?? "OF",
    throws:   row.throws,
    bats:     row.bats,
    charts,
    gameStats: stats,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTeam(row: any, players: Player[] = []): Team {
  return {
    id:        row.id,
    name:      row.name,
    shortName: row.short_name ?? undefined,
    color:     row.color ?? "#22c55e",
    players,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToGameStat(row: any): GameStat {
  return {
    id:           row.id,
    gameDate:     row.game_date,
    opponent:     row.opponent,
    battingOrder: row.batting_order,
    atBats:       row.at_bats ?? [],
    uploadedAt:   row.uploaded_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToChartFile(row: any): ChartFile {
  return {
    id:         row.id,
    fileName:   row.file_name,
    fileSize:   row.file_size,
    gameDate:   row.game_date,
    uploadedAt: row.uploaded_at,
    dbKey:      row.id,
    mimeType:   "application/pdf",
  };
}

// ─── Teams ───────────────────────────────────────────────────────────────────

export async function getTeams(): Promise<Team[]> {
  const { data: teamRows } = await db.from("teams").select("*").order("created_at");
  if (!teamRows?.length) return [];

  const teamIds = teamRows.map((t) => t.id);
  const [{ data: playerRows }, { data: statRows }, { data: chartRows }] = await Promise.all([
    db.from("players").select("*").in("team_id", teamIds).order("created_at"),
    db.from("game_stats").select("*").order("uploaded_at"),
    db.from("chart_files").select("*").order("uploaded_at"),
  ]);

  return teamRows.map((t) => {
    const players = (playerRows ?? [])
      .filter((p) => p.team_id === t.id)
      .map((p) => {
        const stats  = (statRows ?? []).filter((s) => s.player_id === p.id).map(rowToGameStat);
        const charts = (chartRows ?? []).filter((c) => c.player_id === p.id).map(rowToChartFile);
        return rowToPlayer(p, stats, charts);
      });
    return rowToTeam(t, players);
  });
}

export async function getTeam(id: string): Promise<Team | null> {
  const { data: t } = await db.from("teams").select("*").eq("id", id).single();
  if (!t) return null;

  const { data: playerRows } = await db.from("players").select("*").eq("team_id", id).order("created_at");
  const playerIds = (playerRows ?? []).map((p) => p.id);

  const [{ data: statRows }, { data: chartRows }] = playerIds.length
    ? await Promise.all([
        db.from("game_stats").select("*").in("player_id", playerIds).order("uploaded_at"),
        db.from("chart_files").select("*").in("player_id", playerIds).order("uploaded_at"),
      ])
    : [{ data: [] }, { data: [] }];

  const players = (playerRows ?? []).map((p) => {
    const stats  = (statRows  ?? []).filter((s) => s.player_id === p.id).map(rowToGameStat);
    const charts = (chartRows ?? []).filter((c) => c.player_id === p.id).map(rowToChartFile);
    return rowToPlayer(p, stats, charts);
  });

  return rowToTeam(t, players);
}

export async function createTeam(name: string, shortName?: string, color?: string): Promise<Team> {
  const { data, error } = await db
    .from("teams")
    .insert({ name, short_name: shortName, color: color ?? "#22c55e" })
    .select().single();
  if (error || !data) throw new Error(error?.message ?? "createTeam failed");
  return rowToTeam(data, []);
}

export async function updateTeam(updated: Team): Promise<void> {
  await db.from("teams").update({ name: updated.name, short_name: updated.shortName, color: updated.color }).eq("id", updated.id);
}

export async function deleteTeam(id: string): Promise<void> {
  await db.from("teams").delete().eq("id", id);
}

// ─── Players ─────────────────────────────────────────────────────────────────

export async function addPlayer(
  teamId: string,
  data: { name: string; number: string; position: Position; throws?: "R"|"L"; bats?: "R"|"L"|"S" }
): Promise<Player> {
  const { data: row, error } = await db
    .from("players")
    .insert({ team_id: teamId, name: data.name, number: data.number, position: data.position, throws: data.throws, bats: data.bats })
    .select().single();
  if (error || !row) throw new Error(error?.message ?? "addPlayer failed");
  return rowToPlayer(row, [], []);
}

export async function deletePlayer(teamId: string, playerId: string): Promise<void> {
  await db.from("players").delete().eq("id", playerId).eq("team_id", teamId);
}

// ─── Game Stats ──────────────────────────────────────────────────────────────

export async function addGameStat(
  teamId: string,
  playerId: string,
  stat: Omit<GameStat, "id"|"uploadedAt">
): Promise<GameStat> {
  const { data: row, error } = await db
    .from("game_stats")
    .insert({ team_id: teamId, player_id: playerId, game_date: stat.gameDate, opponent: stat.opponent, batting_order: stat.battingOrder, at_bats: stat.atBats })
    .select().single();
  if (error || !row) throw new Error(error?.message ?? "addGameStat failed");
  return rowToGameStat(row);
}

export async function deleteGameStat(_teamId: string, _playerId: string, statId: string): Promise<void> {
  await db.from("game_stats").delete().eq("id", statId);
}

// ─── Charts ──────────────────────────────────────────────────────────────────

export async function addChart(
  teamId: string,
  playerId: string,
  chart: Omit<ChartFile, "id"|"uploadedAt">
): Promise<ChartFile> {
  const { data: row, error } = await db
    .from("chart_files")
    .insert({ team_id: teamId, player_id: playerId, file_name: chart.fileName, file_size: chart.fileSize, game_date: chart.gameDate })
    .select().single();
  if (error || !row) throw new Error(error?.message ?? "addChart failed");
  return rowToChartFile(row);
}

export async function deleteChart(_teamId: string, _playerId: string, chartId: string): Promise<void> {
  await db.from("chart_files").delete().eq("id", chartId);
}

// ─── No-op init (data lives in Supabase, seeded by SQL migration) ────────────
export function initDefaultTeams(): void { /* no-op */ }
