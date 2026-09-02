export type ChartType =
  | "pitcher-location"
  | "pitcher-tendancy"
  | "opponent-pitcher-tendancy"
  | "hitter-tendancy";

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  "pitcher-location": "投球位置首球好球记录表",
  "pitcher-tendancy": "投球倾向记录表",
  "opponent-pitcher-tendancy": "对手投球倾向记录表",
  "hitter-tendancy": "打击倾向记录表",
};

export const CHART_TYPE_EN: Record<ChartType, string> = {
  "pitcher-location": "Pitcher Location & First Pitch Strike Chart",
  "pitcher-tendancy": "Pitcher Tendancy Chart",
  "opponent-pitcher-tendancy": "Opponent Pitcher Tendancy Chart",
  "hitter-tendancy": "Hitter Tendancy Chart",
};

export type ChartCategory = "pitching" | "batting" | "scouting";

export const CHART_CATEGORY: Record<ChartType, ChartCategory> = {
  "pitcher-location": "pitching",
  "pitcher-tendancy": "pitching",
  "hitter-tendancy": "batting",
  "opponent-pitcher-tendancy": "scouting",
};

export const POSITIONS = [
  "P","C","1B","2B","3B","SS","LF","CF","RF","DH","OF","INF",
] as const;
export type Position = typeof POSITIONS[number];

export interface ChartFile {
  id: string;
  type: ChartType;
  fileName: string;
  gameDate?: string;
  opponent?: string;
  uploadedAt: string;
}

export interface Player {
  id: string;
  name: string;
  number: string;
  position: Position;
  throws?: "R" | "L";
  bats?: "R" | "L" | "S";
  charts: ChartFile[];
}

export interface Team {
  id: string;
  name: string;
  shortName?: string;
  color?: string;
  players: Player[];
  createdAt: string;
}
