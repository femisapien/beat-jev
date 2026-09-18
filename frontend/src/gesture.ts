import type { Aim, Kick } from "../../shared/types";
import { defaultKick } from "../../shared/flight";
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
// Signed deviation from the start/end chord produces one bounded bend.
// Extra loops cannot add more bends or increase the shot's travel distance.
export function kickFromGesture(
  points: Aim[],
  elapsedMs: number,
  scale: number,
): Kick {
  const first = points[0],
    last = points.at(-1);
  if (
    !first ||
    !last ||
    points.every((p) => Math.hypot(p.x - first.x, p.y - first.y) <= 12)
  )
    return { ...defaultKick };
  const dx = last.x - first.x,
    dy = last.y - first.y;
  const length = Math.hypot(dx, dy);
  let deviation = 0;
  for (const p of points) {
    const t = clamp(
      ((p.x - first.x) * dx + (p.y - first.y) * dy) / Math.max(1, length ** 2),
      0,
      1,
    );
    deviation += p.x - (first.x + dx * t);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    power: round(
      clamp(
        (length / Math.max(1, scale) / Math.max(0.12, elapsedMs / 1000)) * 1.8,
        0.2,
        1,
      ),
    ),
    curl: round(
      clamp(deviation / points.length / Math.max(1, scale * 0.07), -1, 1),
    ),
  };
}
