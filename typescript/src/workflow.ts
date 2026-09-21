import {
  defaultKick,
  flightPath,
  observeBall,
  impactTime,
} from "../../shared/flight";
import { task } from "@renderinc/sdk/workflows";
import { createMatch, changeMatch, readMatch } from "./store";
import { decideKeeper, decideShot, decidePosition } from "./keeper";
import { record, submit, keeperMove, resolveShot } from "./game";
import config from "../../shared/game.json";
import {
  prepareInput,
  waitForInput,
  readInput,
  saveReaction,
  saveAttack,
  waitForDefense,
} from "./inputs";
import type { Command, Shot, Positioning } from "../../shared/types";
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
      shot.kick = slot.input.kick || defaultKick;
      return shot;
    });
  },
);
const positionKeeper = task(
  { ...settings, name: "position_goalkeeper" },
  async (_ctx, cmd: Command) => {
    const match = await readMatch(cmd.matchId, cmd.owner);
    if (match.state.positioning?.number === cmd.number)
      return match.state.positioning;
    const positioning: Positioning = { number: cmd.number!, x: 0 };
    try {
      positioning.decision = await decidePosition(match.state.shots);
      positioning.x =
        config.positions[
          positioning.decision.choice as keyof typeof config.positions
        ];
    } catch {
      /* Neutral stance remains playable if the model is unavailable. */
    }
    return changeMatch(cmd.matchId, cmd.owner, (m) => {
      if (m.state.positioning?.number !== cmd.number)
        m.state.positioning = positioning;
      return m.state.positioning;
    });
  },
);
const goalkeeperAction = task(
  { ...settings, name: "goalkeeper_action" },
  async (_ctx, cmd: Command) => {
    const slot = await waitForInput(cmd, "keeper");
    if (!slot) return null;
    if (slot.reaction) return slot.reaction;
    const { aim, path, kick = defaultKick } = slot.input;
    const positioning = (await readMatch(cmd.matchId, cmd.owner)).state
      .positioning;
    const released = new Date(slot.released_at).getTime();
    const shot: Shot = {
      number: cmd.number!,
      shooter: "player",
      aim,
      path,
      kick,
      positioning,
    };
    // Observe only after these frames have happened in the released shot.
    await new Promise((r) =>
      setTimeout(
        r,
        Math.max(
          0,
          released + config.runupMs + config.observationMs - Date.now(),
        ),
      ),
    );
    const remaining = config.reactionWindowMs - (Date.now() - released);
    try {
      if (remaining <= 0) throw new Error("Deadline passed.");
      shot.decision = await decideKeeper(observeBall(aim, kick), remaining);
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
    const movement = keeperMove(
      aim,
      choice,
      positioning?.x || 0,
      impactTime(kick) - shot.reactionMs,
    );
    Object.assign(shot, movement, resolveShot(aim, choice, movement.keeper));
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

const prepareTurn = task(
  { ...settings, name: "prepare_turn" },
  async (_ctx, cmd: Command) => {
    const slot = await prepareInput(cmd.matchId, cmd.number!);
    return { ...cmd, inputId: slot.id };
  },
);
const jevKick = task(
  { ...settings, name: "jev_kick" },
  async (_ctx, cmd: Command) => {
    let attack = (await readInput(cmd.matchId, cmd.number!)).attack as
      Shot | undefined;
    if (!attack) {
      const match = await readMatch(cmd.matchId, cmd.owner);
      const decision = await decideShot(match.state.shots);
      const zone = config.zones[decision.choice as keyof typeof config.zones];
      const aim = { x: zone.x, y: zone.y };
      attack = await saveAttack(cmd.inputId!, {
        number: cmd.number!,
        shooter: "jev",
        aim,
        decision,
        kick: defaultKick,
        path: flightPath(aim),
      });
    }
    const slot = await waitForInput(cmd, "player");
    if (!slot) return null;
    return changeMatch(cmd.matchId, cmd.owner, (m) =>
      Object.assign(submit(m.state, cmd.number!, attack!.aim!), attack),
    );
  },
);
const playerSave = task(
  { ...settings, name: "player_save" },
  async (_ctx, cmd: Command) => {
    const slot = await waitForInput(cmd, "keeper");
    if (!slot) return null;
    if (slot.reaction) return slot.reaction;
    const input = await waitForDefense(cmd);
    const keeper = input.defense || { x: 0, y: 0.25 };
    const shot: Shot = {
      ...input.attack,
      keeperAction: input.defense ? "dive" : "hold",
      reaction: input.defense ? "ready" : "late",
      ...resolveShot(
        input.attack.aim,
        input.defense ? "human" : "leave_wide",
        keeper,
      ),
    };
    return saveReaction(slot.id, shot);
  },
);
const finishMatch = task(
  { ...settings, name: "finish_match" },
  async (_ctx, cmd: Command) =>
    changeMatch(cmd.matchId, cmd.owner, (m) => {
      const completed = m.state.shots.filter((s) => s.outcome);
      m.state.finished = completed.length === config.shots * 2;
      m.state.abandoned = !m.state.finished;
      return {
        goals: completed.filter(
          (s) => s.shooter !== "jev" && s.outcome === "goal",
        ).length,
        jevGoals: completed.filter(
          (s) => s.shooter === "jev" && s.outcome === "goal",
        ).length,
        abandoned: m.state.abandoned,
      };
    }),
);
const takePenalty = task(
  { ...parent, name: "take_penalty" },
  async (ctx, cmd: Command) => {
    const [input] = await Promise.all([
      ctx.run(prepareTurn, cmd),
      ...(cmd.number! % 2 ? [ctx.run(positionKeeper, cmd)] : []),
    ]);
    const [kick, keeper] =
      cmd.number! % 2
        ? await Promise.all([
            ctx.run(playerKick, input),
            ctx.run(goalkeeperAction, input),
          ])
        : await Promise.all([
            ctx.run(jevKick, input),
            ctx.run(playerSave, input),
          ]);
    if (!kick || !keeper) return { expired: true };
    await ctx.run(recordResult, cmd);
    return { expired: false };
  },
);
// One root owns the whole match. Root retries are disabled to avoid replaying the game.
task(
  { ...parent, name: "run_game", timeoutSeconds: 1200 },
  async (ctx, cmd: Command) => {
    await ctx.run(registerPlayer, cmd);
    await ctx.run(beginMatch, cmd);
    for (let number = 1; number <= config.shots * 2; number++) {
      const turn = await ctx.run(takePenalty, { ...cmd, number });
      if (turn.expired) break;
    }
    return ctx.run(finishMatch, cmd);
  },
);
