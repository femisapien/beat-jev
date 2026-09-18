import type { Aim, Shot } from "../../shared/types";
import config from "../../shared/game.json";
export type Playback = {
  number: number;
  aim: Aim;
  path: Aim[];
  startedAt: number;
  reaction?: Shot;
  keeperStartedAt?: number;
};
export const impactMs = config.runupMs + config.flightMs;
export const endMs = impactMs + 300;
export const groundAim = (aim: Aim): Aim => ({
  x: Math.round(Math.max(-1.6, Math.min(1.6, aim.x)) * 1000) / 1000,
  y: Math.round(Math.max(0.06, Math.min(1.5, aim.y)) * 1000) / 1000,
});
export function directPath(aim: Aim): Aim[] {
  return [
    { x: 0, y: 0.06 },
    { x: aim.x * 0.5, y: Math.max(0.06, (aim.y + 0.06) * 0.5 + 0.3) },
    aim,
  ];
}
export function missLabel(aim?: Aim) {
  return aim && aim.y > 0.965 ? "OVER" : "WIDE";
}
