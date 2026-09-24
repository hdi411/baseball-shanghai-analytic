import { englishPlayerParts } from "@/lib/englishNames";
import type { Team, Player } from "@/lib/types";

// The English name (as in the league's 40-man list) with the family name in bold, like the official site,
// and everything else regular
// (weight is pinned to 400 so a bold/medium parent can't make the given names look bold too).
// Renders nothing when there is no English name.
export function EnglishName({ team, player, className, style }: {
  team: Team; player: Player; className?: string; style?: React.CSSProperties;
}) {
  const p = englishPlayerParts(team, player);
  if (!p) return null;
  // split around the bold (family) stretch, wherever it sits in the name
  const at = p.family ? p.name.indexOf(p.family) : -1;
  const before = at > 0 ? p.name.slice(0, at) : "";
  const bold = at >= 0 && p.family ? p.family : "";
  const after = at >= 0 && p.family ? p.name.slice(at + p.family.length) : p.name;
  return (
    <span className={className} style={{ fontWeight: 400, ...style }}>
      {before}{bold && <strong style={{ fontWeight: 700 }}>{bold}</strong>}{after}
    </span>
  );
}
