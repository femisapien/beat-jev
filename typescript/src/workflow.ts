import { task } from "@renderinc/sdk/workflows";
import { createMatch, readMatch, changeMatch } from "./store";
import { decideKeeper } from "./keeper";
import { record } from "./game";
import type { Command } from "../../shared/types";
const retry = { maxRetries: 2, waitDurationMs: 500, backoffScaling: 2 };
const settings = { plan: "flex" as const, retry, timeoutSeconds: 60 };

export const preparePenalty = task(
  { ...settings, name: "prepare_penalty" },
  async (_ctx, cmd: Command) => {
    const match = await readMatch(cmd.matchId, cmd.owner);
    const number = cmd.number!;
    if (match.state.shots.some((s) => s.number === number))
      return { ready: true, number };
    if (
      match.state.finished ||
      number !== match.state.shots.filter((s) => s.outcome).length + 1 ||
      number > 5
    )
      throw new Error("Penalty out of order.");
    const decision = await decideKeeper(match.state.shots);
    await changeMatch(cmd.matchId, cmd.owner, (m) => {
      // Concurrent retries keep the first committed decision.
      if (!m.state.shots.some((s) => s.number === number))
        m.state.shots.push({ number, decision });
    });
    return { ready: true, number };
  },
);
export const recordShot = task(
  { ...settings, name: "record_shot" },
  async (_ctx, cmd: Command) =>
    changeMatch(cmd.matchId, cmd.owner, (m) =>
      record(m.state, cmd.number!, cmd.aim!),
    ),
);
export const finishGame = task(
  { ...settings, name: "finish_game" },
  async (_ctx, cmd: Command) =>
    changeMatch(cmd.matchId, cmd.owner, (m) => {
      if (m.state.shots.filter((s) => s.outcome).length !== 5)
        throw new Error("Match is not complete.");
      m.state.finished = true;
      return {
        goals: m.state.shots.filter((s) => s.outcome === "goal").length,
        attempts: 5,
      };
    }),
);

// Retrying the same command is safe: Postgres preserves committed decisions and shots.
export const startGame = task(
  {
    ...settings,
    name: "start_game",
    retry: { maxRetries: 0, waitDurationMs: 500 },
    timeoutSeconds: 180,
  },
  async (ctx, cmd: Command) => {
    await createMatch(cmd.matchId, cmd.owner, cmd.name!);
    await ctx.run(preparePenalty, { ...cmd, number: 1 });
    return { matchId: cmd.matchId };
  },
);
export const takeShot = task(
  {
    ...settings,
    name: "take_shot",
    retry: { maxRetries: 0, waitDurationMs: 500 },
    timeoutSeconds: 180,
  },
  async (ctx, cmd: Command) => {
    const shot = await ctx.run(recordShot, cmd);
    if (cmd.number === 5) await ctx.run(finishGame, cmd);
    else
      await ctx.run(preparePenalty, {
        matchId: cmd.matchId,
        owner: cmd.owner,
        number: cmd.number! + 1,
      });
    return { number: cmd.number, outcome: shot.outcome };
  },
);
