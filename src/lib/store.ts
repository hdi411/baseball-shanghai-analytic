// Supabase-backed store — replaces localStorage version
import { createClient } from "@supabase/supabase-js";
import type { Team, Player, ChartFile, GameStat, Position, PitchLocationStat } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const db = createClient(supabaseUrl, supabaseKey);

// ─── helpers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPlayer(row: any, stats: GameStat[] = [], charts: ChartFile[] = [], pitchLocationStats: PitchLocationStat[] = []): Player {
  return {
    id:       row.id,
    name:     row.name ?? "",
    number:   row.number ?? "",
    position: (row.position as Position) ?? "OF",
    throws:   row.throws,
    bats:     row.bats,
    charts,
    gameStats: stats,
    pitchLocationStats,
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
    type:       row.type ?? "pitcher-location",
    fileName:   row.file_name,
    gameDate:   row.game_date,
    opponent:   row.opponent,
    uploadedAt: row.uploaded_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToPitchLocationStat(row: any): PitchLocationStat {
  const raw = row.zone_counts;
  const zoneCounts: number[] = Array.isArray(raw) ? raw.map(Number) : Array(25).fill(0);
  return {
    id:         row.id,
    gameDate:   row.game_date,
    opponent:   row.opponent,
    zoneCounts,
    createdAt:  row.created_at,
    vsBats:     row.vs_bats ?? undefined,
    countCounts: row.count_counts ?? undefined,
  };
}

// ─── Paged reads ─────────────────────────────────────────────────────────────

// PostgREST returns at most 1000 rows per request and does NOT say it truncated, so a
// plain select() silently loses everything past row 1000 (game_stats / pitch_location_stats
// pass that once a season is imported). Read in pages until a short page comes back.
const PAGE_SIZE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function selectAll(table: string, orderBy: string, filter?: (q: any) => any): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = db.from(table).select("*");
    if (filter) q = filter(q);
    // "id" as a tiebreaker keeps page boundaries stable when timestamps collide
    const { data, error } = await q.order(orderBy).order("id").range(from, from + PAGE_SIZE - 1);
    if (error) { console.error(`load ${table} failed:`, error.message); break; }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

// ─── Teams ───────────────────────────────────────────────────────────────────

// Teams with their rosters only — no game stats or charts (those are the bulk of the data).
// Use getTeam(id) to load one team's full stats when it is actually needed.
export async function getTeamList(): Promise<Team[]> {
  const { data: teamRows } = await db.from("teams").select("*").order("created_at");
  if (!teamRows?.length) return [];

  const playerRows = await selectAll("players", "created_at", (q) => q.in("team_id", teamRows.map((t) => t.id)));
  return teamRows.map((t) =>
    rowToTeam(t, playerRows.filter((p) => p.team_id === t.id).map((p) => rowToPlayer(p))),
  );
}

export async function getTeam(id: string): Promise<Team | null> {
  const { data: t } = await db.from("teams").select("*").eq("id", id).single();
  if (!t) return null;

  const playerRows = await selectAll("players", "created_at", (q) => q.eq("team_id", id));
  const playerIds = playerRows.map((p) => p.id);

  const [statRows, chartRows, plsRows] = playerIds.length
    ? await Promise.all([
        selectAll("game_stats", "uploaded_at", (q) => q.in("player_id", playerIds)),
        selectAll("chart_files", "uploaded_at", (q) => q.in("player_id", playerIds)),
        selectAll("pitch_location_stats", "created_at", (q) => q.in("player_id", playerIds)),
      ])
    : [[], [], []];

  const players = (playerRows ?? []).map((p) => {
    const stats  = (statRows  ?? []).filter((s) => s.player_id === p.id).map(rowToGameStat);
    const charts = (chartRows ?? []).filter((c) => c.player_id === p.id).map(rowToChartFile);
    const pls    = (plsRows   ?? []).filter((r) => r.player_id === p.id).map(rowToPitchLocationStat);
    return rowToPlayer(p, stats, charts, pls);
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
    .insert({ team_id: teamId, player_id: playerId, type: chart.type, file_name: chart.fileName, game_date: chart.gameDate, opponent: chart.opponent })
    .select().single();
  if (error || !row) throw new Error(error?.message ?? "addChart failed");
  return rowToChartFile(row);
}

export async function deleteChart(_teamId: string, _playerId: string, chartId: string): Promise<void> {
  await db.from("chart_files").delete().eq("id", chartId);
}

// ─── No-op init (data lives in Supabase, seeded by SQL migration) ────────────
export function initDefaultTeams(): void { /* no-op */ }
