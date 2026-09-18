import { task } from "@renderinc/sdk/workflows";
import { createMatch, readMatch, changeMatch } from "./store";
import { decideKeeper } from "./keeper";
import { record, submit, keeperMove } from "./game";
import type { Command } from "../../shared/types";
const retry = { maxRetries: 2, waitDurationMs: 500, backoffScaling: 2 };
const settings = { plan: "flex" as const, retry, timeoutSeconds: 60 };
const parent = {
  ...settings,
  retry: { maxRetries: 0, waitDurationMs: 500 },
  timeoutSeconds: 180,
};

const registerPlayer = task(
  { ...settings, name: "register_player" },
  async (_ctx, cmd: Command) => {
    await createMatch(cmd.matchId, cmd.owner, cmd.name!);
    return { matchId: cmd.matchId };
  },
);
const beginMatch = task(
  { ...settings, name: "begin_match" },
  async (_ctx, cmd: Command) =>
    changeMatch(cmd.matchId, cmd.owner, (m) => {
      m.state.started = true;
      return { ready: true };
    }),
);
const playerKick = task(
  { ...settings, name: "player_kick" },
  async (_ctx, cmd: Command) =>
    changeMatch(cmd.matchId, cmd.owner, (m) =>
      submit(m.state, cmd.number!, cmd.aim!),
    ),
);
const goalkeeperAction = task(
  { ...settings, name: "goalkeeper_action" },
  async (_ctx, cmd: Command) => {
    const match = await readMatch(cmd.matchId, cmd.owner);
    const shot = match.state.shots.find((s) => s.number === cmd.number);
    if (!shot?.aim) throw new Error("Penalty not submitted.");
    if (shot.decision && shot.keeper)
      return {
        decision: shot.decision,
        keeper: shot.keeper,
        keeperAction: shot.keeperAction,
      };
    const decision = shot.decision || (await decideKeeper(shot.aim));
    return changeMatch(cmd.matchId, cmd.owner, (m) => {
      const saved = m.state.shots.find((s) => s.number === cmd.number)!;
      // Concurrent retries preserve the first committed response.
      saved.decision ??= decision;
      Object.assign(saved, keeperMove(saved.aim!, saved.decision.choice));
      return {
        decision: saved.decision,
        keeper: saved.keeper,
        keeperAction: saved.keeperAction,
      };
    });
  },
);
const recordResult = task(
  { ...settings, name: "record_result" },
  async (_ctx, cmd: Command) =>
    changeMatch(cmd.matchId, cmd.owner, (m) =>
      record(m.state, cmd.number!, cmd.aim!),
    ),
);
const finishMatch = task(
  { ...settings, name: "finish_match" },
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

export const startGame = task(
  { ...parent, name: "start_game" },
  async (ctx, cmd: Command) => {
    await ctx.run(registerPlayer, cmd);
    await ctx.run(beginMatch, cmd);
    return { matchId: cmd.matchId };
  },
);
export const takePenalty = task(
  { ...parent, name: "take_penalty" },
  async (ctx, cmd: Command) => {
    await ctx.run(playerKick, cmd);
    await ctx.run(goalkeeperAction, cmd);
    const shot = await ctx.run(recordResult, cmd);
    if (cmd.number === 5) await ctx.run(finishMatch, cmd);
    return { number: cmd.number, outcome: shot.outcome };
  },
);
