import config from "../../shared/game.json";
import type { Aim, Game, Match, Shot, State } from "../../shared/types";
export const zones = config.zones as Record<string, Aim & { label: string }>;
export function keeperMove(aim: Aim, choice: string) {
  const hold =
    Math.abs(aim.x) > 0.965 ||
    aim.y < 0.035 ||
    aim.y > 0.965 ||
    choice === "leave_wide";
  const keeper = hold ? { x: 0, y: 0.4 } : zones[choice];
  if (!keeper) throw new Error("Invalid keeper action.");
  return { keeper, keeperAction: hold ? ("hold" as const) : ("dive" as const) };
}
export function resolveShot(
  aim: Aim,
  choice: string,
  keeper = keeperMove(aim, choice).keeper,
) {
  const wide = Math.abs(aim.x) > 0.965 || aim.y < 0.035 || aim.y > 0.965;
  const reached =
    choice !== "leave_wide" &&
    ((aim.x - keeper.x) / config.reach.x) ** 2 +
      ((aim.y - keeper.y) / config.reach.y) ** 2 <=
      1;
  return {
    outcome: (wide ? "wide" : reached ? "saved" : "goal") as Shot["outcome"],
    keeper,
  };
}
export function record(state: State, number: number, aim: Aim) {
  const shot = state.shots.find((s) => s.number === number);
  if (!shot || (!shot.decision && !shot.reaction) || !shot.keeper)
    throw new Error("Keeper is not ready.");
  if (shot.outcome) {
    if (shot.aim?.x !== aim.x || shot.aim?.y !== aim.y)
      throw new Error("This penalty is already committed.");
    return shot;
  }
  if (
    state.finished ||
    number !== state.shots.filter((s) => s.outcome).length + 1 ||
    number > config.shots * 2
  )
    throw new Error("Penalty out of order.");
  Object.assign(shot, {
    aim,
    ...resolveShot(
      aim,
      shot.shooter === "jev"
        ? shot.reaction === "late"
          ? "leave_wide"
          : "human"
        : shot.reaction && shot.reaction !== "ready"
          ? "leave_wide"
          : shot.decision!.choice,
      shot.keeper,
    ),
    committedAt: new Date().toISOString(),
  });
  return shot;
}
export function publicGame(
  match: Match,
  totals: { attempts: number; goals: number },
): Game {
  const shots = match.state.shots.filter((s) => s.outcome);
  return {
    id: match.id,
    name: match.name,
    shots,
    started: !!match.state.started,
    ready:
      !!match.state.started &&
      !match.state.finished &&
      !match.state.abandoned &&
      shots.length < config.shots * 2 &&
      !match.state.shots.some((s) => !s.outcome),
    finished: match.state.finished,
    abandoned: !!match.state.abandoned,
    attempts: shots.length,
    goals: shots.filter((s) => s.outcome === "goal" && s.shooter !== "jev")
      .length,
    jevGoals: shots.filter((s) => s.outcome === "goal" && s.shooter === "jev")
      .length,
    totalAttempts: totals.attempts,
    totalGoals: totals.goals,
  };
}

// Lock the aim before inference. A retry cannot aim the same penalty elsewhere.
export function submit(state: State, number: number, aim: Aim) {
  const existing = state.shots.find((s) => s.number === number);
  if (existing) {
    if (existing.aim?.x !== aim.x || existing.aim?.y !== aim.y)
      throw new Error("This penalty is already committed.");
    return existing;
  }
  if (
    !state.started ||
    state.finished ||
    number !== state.shots.filter((s) => s.outcome).length + 1 ||
    number > config.shots * 2
  )
    throw new Error("Penalty out of order.");
  const shot: Shot = { number, aim, shooter: number % 2 ? "player" : "jev" };
  state.shots.push(shot);
  return shot;
}
