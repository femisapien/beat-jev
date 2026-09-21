import type { Aim, Kick, Shot, Positioning } from "../../shared/types";
import { impactTime, endTime, flightPath } from "../../shared/flight";
export type Playback = {
  number: number;
  shooter?: "player" | "jev";
  aim: Aim;
  path: Aim[];
  kick?: Kick;
  startedAt: number;
  reaction?: Shot;
  keeperStartedAt?: number;
  positioning?: Positioning;
};
export const impactMs = impactTime();
export const endMs = endTime();
export function keeperMotion(
  flight: Playback | null,
  now: number,
  reducedMotion = false,
) {
  const shot = flight?.reaction;
  if (!flight || shot?.keeperAction !== "dive" || !shot.keeper) return null;
  const impact = impactTime(flight.kick);
  const receivedAt = flight.keeperStartedAt;
  // A fast decision can wait for the ball. A late delivery never teleports the keeper.
  const start = Math.max(receivedAt ?? now, flight.startedAt + impact - 650);
  const duration = Math.max(450, flight.startedAt + impact - start);
  const t =
    receivedAt === undefined || now < receivedAt
      ? 0
      : reducedMotion
        ? 1
        : Math.max(0, Math.min(1, (now - start) / duration));
  return { target: shot.keeper, progress: t * t * (3 - 2 * t) };
}
export const groundAim = (aim: Aim): Aim => ({
  x: Math.round(Math.max(-1.6, Math.min(1.6, aim.x)) * 1000) / 1000,
  y: Math.round(Math.max(0.06, Math.min(1.5, aim.y)) * 1000) / 1000,
});
export const directPath = flightPath;
export function missLabel(aim?: Aim) {
  return aim && aim.y > 0.965 ? "OVER" : "WIDE";
}
