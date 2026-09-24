import { englishPlayerParts } from "@/lib/englishNames";
import type { Team, Player } from "@/lib/types";

// The English name the way the official site shows it: family name in bold, given names regular.
// Renders nothing when there is no English name.
export function EnglishName({ team, player, className, style }: {
  team: Team; player: Player; className?: string; style?: React.CSSProperties;
}) {
  const p = englishPlayerParts(team, player);
  if (!p) return null;
  return (
    <span className={className} style={style}>
      <strong style={{ fontWeight: 700 }}>{p.family}</strong>{p.given ? ` ${p.given}` : ""}
    </span>
  );
}
