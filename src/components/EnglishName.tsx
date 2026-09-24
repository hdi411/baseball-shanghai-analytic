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
  // cut the name into plain / bold pieces; each bold stretch is searched for after the previous one
  const bolds = p.family ? (Array.isArray(p.family) ? p.family : [p.family]) : [];
  const pieces: { text: string; bold: boolean }[] = [];
  let pos = 0;
  for (const b of bolds) {
    const at = p.name.indexOf(b, pos);
    if (at < 0) continue;
    if (at > pos) pieces.push({ text: p.name.slice(pos, at), bold: false });
    pieces.push({ text: b, bold: true });
    pos = at + b.length;
  }
  if (pos < p.name.length) pieces.push({ text: p.name.slice(pos), bold: false });
  return (
    <span className={className} style={{ fontWeight: 400, ...style }}>
      {pieces.map((x, i) => x.bold ? <strong key={i} style={{ fontWeight: 700 }}>{x.text}</strong> : x.text)}
    </span>
  );
}
