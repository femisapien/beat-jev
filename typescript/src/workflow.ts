import { task } from "@renderinc/sdk/workflows";
import { createMatch, changeMatch } from "./store";
import { decideKeeper } from "./keeper";
import { record, submit, keeperMove, resolveShot } from "./game";
import config from "../../shared/game.json";
import { waitForInput, readInput, saveReaction } from "./inputs";
import type { Command, Shot } from "../../shared/types";
const retry = { maxRetries: 2, waitDurationMs: 500, backoffScaling: 2 };
const settings = { plan: "flex" as const, retry, timeoutSeconds: 120 };
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
  async (_ctx, cmd: Command) => {
    const slot = await waitForInput(cmd, "player");
    if (!slot) return null;
    return changeMatch(cmd.matchId, cmd.owner, (m) => {
      const shot = submit(m.state, cmd.number!, slot.input.aim);
      shot.path = slot.input.path;
      return shot;
    });
  },
);
const goalkeeperAction = task(
  { ...settings, name: "goalkeeper_action" },
  async (_ctx, cmd: Command) => {
    const slot = await waitForInput(cmd, "keeper");
    if (!slot) return null;
    if (slot.reaction) return slot.reaction;
    const { aim, path } = slot.input;
    const released = new Date(slot.released_at).getTime();
    const shot: Shot = { number: cmd.number!, aim, path };
    const remaining = config.reactionWindowMs - (Date.now() - released);
    try {
      if (remaining <= 0) throw new Error("Deadline passed.");
      shot.decision = await decideKeeper(aim, path, remaining);
      shot.reaction =
        Date.now() - released <= config.reactionWindowMs ? "ready" : "late";
    } catch {
      shot.reaction =
        Date.now() - released >= config.reactionWindowMs - 10
          ? "late"
          : "unavailable";
    }
    shot.reactionMs = Date.now() - released;
    const choice =
      shot.reaction === "ready" ? shot.decision!.choice : "leave_wide";
    Object.assign(shot, keeperMove(aim, choice), resolveShot(aim, choice));
    return saveReaction(slot.id, shot);
  },
);
const recordResult = task(
  { ...settings, name: "record_result" },
  async (_ctx, cmd: Command) => {
    const slot = await readInput(cmd.matchId, cmd.number!);
    if (!slot?.reaction) throw new Error("Keeper is not ready.");
    return changeMatch(cmd.matchId, cmd.owner, (m) => {
      const shot = m.state.shots.find((s) => s.number === cmd.number)!;
      if (!shot.outcome) {
        const { outcome, ...reaction } = slot.reaction;
        Object.assign(shot, reaction);
      }
      return record(m.state, cmd.number!, slot.input.aim);
    });
  },
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
    // Both tasks wait for the same immutable input, on separate Render instances.
    const [kick, keeper] = await Promise.all([
      ctx.run(playerKick, cmd),
      ctx.run(goalkeeperAction, cmd),
    ]);
    if (!kick || !keeper) return { number: cmd.number, expired: true };
    const shot = await ctx.run(recordResult, cmd);
    if (cmd.number === 5) await ctx.run(finishMatch, cmd);
    return { number: cmd.number, outcome: shot.outcome };
  },
);
