import config from "./game.json";
import type { Aim, Kick } from "./types";

export const defaultKick: Kick = { power: 0.6, curl: 0 };
export const flightMs = (kick: Kick = defaultKick) => 1450 - 250 * kick.power;
export const impactTime = (kick?: Kick) => config.runupMs + flightMs(kick);
export const endTime = (kick?: Kick) => impactTime(kick) + 300;
export type BallSample = {
  ms: number;
  x: number;
  y: number;
  distanceToGoal: number;
};

// One bounded arc for rendering, observations and the goal-line crossing.
// The swipe controls curl and speed, never a list of waypoints.
export function ballAt(aim: Aim, kick: Kick = defaultKick, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const seconds = flightMs(kick) / 1000;
  return {
    x: aim.x * 3.66 * t + kick.curl * 0.65 * 4 * t * (1 - t),
    y:
      0.1464 +
      (aim.y * 2.44 - 0.1464) * t +
      0.5 * 9.81 * seconds ** 2 * t * (1 - t),
    z: 4.5 - 10.5 * t,
  };
}
export function flightPath(aim: Aim, kick: Kick = defaultKick): Aim[] {
  return Array.from({ length: 17 }, (_, i) => {
    const p = ballAt(aim, kick, i / 16);
    return { x: p.x / 3.66, y: p.y / 2.44 };
  });
}
export function observeBall(aim: Aim, kick: Kick = defaultKick): BallSample[] {
  return [0, config.observationMs / 2, config.observationMs].map((ms) => {
    const p = ballAt(aim, kick, ms / flightMs(kick));
    const round = (n: number) => Math.round(n * 100) / 100;
    return { ms, x: round(p.x), y: round(p.y), distanceToGoal: round(p.z + 6) };
  });
}
// This is the only state sent to the goalkeeper model. No target or future samples.
export function keeperObservation(samples: BallSample[]) {
  const [a, b, c] = samples;
  const seconds = (c.ms - a.ms) / 1000;
  const round = (n: number) => Math.round(n * 100) / 100;
  const vx = (c.x - a.x) / seconds,
    vy = (c.y - a.y) / seconds;
  const vz = (a.distanceToGoal - c.distanceToGoal) / seconds;
  const time = b.distanceToGoal / vz;
  const x = b.x + vx * time,
    y = b.y + vy * time - 4.905 * time ** 2;
  return {
    estimate: {
      horizontalRange: [round(x - 0.6), round(x + 0.6)],
      heightRange: [round(y - 0.25), round(y + 0.25)],
      note: "Rough goal-line range, estimated ONLY from early measured velocity and gravity. Sideways acceleration is unknown: a curling shot can land outside this range. This is not the actual destination.",
    },
    measuredMotion: {
      atMs: b.ms,
      horizontalMetresPerSecond: round((c.x - a.x) / seconds),
      verticalMetresPerSecond: round((c.y - a.y) / seconds),
      forwardMetresPerSecond: round(
        (a.distanceToGoal - c.distanceToGoal) / seconds,
      ),
    },
    observedMs: config.observationMs,
    ball: samples.map(({ ms, x, y, distanceToGoal }) => ({
      ms,
      x,
      y,
      distanceToGoal,
    })),
    goal: { leftPost: -3.66, rightPost: 3.66, crossbar: 2.44, ground: 0 },
    coordinates:
      "Metres, shooter's view: negative x is screen left, positive x is screen right, y is height. distanceToGoal decreases as the ball approaches. Samples are observations after foot contact, not a planned route. Gravity is 9.81 m/s²; the ball can curve sideways. The future landing point is unknown.",
  };
}
