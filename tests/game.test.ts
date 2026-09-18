import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveShot,
  record,
  submit,
  publicGame,
  keeperMove,
} from "../typescript/src/game";
import type { Match, Decision, State } from "../shared/types";
const decision: Decision = {
  choice: "left_low",
  probabilities: { left_low: 1 },
  confidence: 1,
  model: "test",
  durationMs: 1,
  state: {
    ball: { projectedCrossing: { x: -0.62, y: 0.25 } },
    coordinates: "test",
  },
};
const state = (): State => ({ shots: [], started: true, finished: false });
test("covered shots save, uncovered shots score, leaving an on-target shot scores", () => {
  assert.equal(resolveShot({ x: -0.62, y: 0.25 }, "left_low").outcome, "saved");
  assert.equal(resolveShot({ x: 0.92, y: 0.92 }, "right_high").outcome, "goal");
  assert.equal(resolveShot({ x: 0, y: 0.4 }, "leave_wide").outcome, "goal");
});
test("wide shots cannot score or trigger a dive, even if the model misreads them", () => {
  for (const aim of [
    { x: 1.2, y: 0.5 },
    { x: 0, y: 1.1 },
    { x: 0, y: -0.1 },
  ]) {
    const r = resolveShot(aim, "left_high");
    assert.equal(r.outcome, "wide");
    assert.deepEqual(r.keeper, { x: 0, y: 0.4 });
  }
});
test("submission locks the target before inference and retries preserve the outcome", () => {
  const s = state(),
    aim = { x: 0.8, y: 0.8 };
  const shot = submit(s, 1, aim);
  assert.equal(submit(s, 1, aim), shot);
  assert.throws(() => submit(s, 1, { x: 0, y: 0.3 }), /committed/);
  assert.throws(() => record(s, 1, aim), /ready/);
  shot.decision = decision;
  Object.assign(shot, keeperMove(aim, decision.choice));
  const first = structuredClone(record(s, 1, aim));
  assert.deepEqual(record(s, 1, aim), first);
  assert.equal(s.shots.length, 1);
});
test("out-of-order penalties and conflicting recorded targets are rejected", () => {
  const s = state();
  assert.throws(() => submit(s, 2, { x: 0, y: 0.3 }), /order/);
  Object.assign(
    submit(s, 1, { x: 0.8, y: 0.8 }),
    { decision },
    keeperMove({ x: 0.8, y: 0.8 }, decision.choice),
  );
  record(s, 1, { x: 0.8, y: 0.8 });
  assert.throws(() => record(s, 1, { x: 0, y: 0.3 }), /committed/);
});
test("public state is ready only when no penalty is pending and hides unfinished data", () => {
  const m: Match = {
    id: "test",
    name: "Guest",
    owner_hash: "hidden",
    state: state(),
  };
  assert.equal(publicGame(m, { attempts: 0, goals: 0 }).ready, true);
  submit(m.state, 1, { x: 0.8, y: 0.8 });
  const pending = publicGame(m, { attempts: 0, goals: 0 });
  assert.equal(pending.ready, false);
  assert.deepEqual(pending.shots, []);
  assert.equal("owner_hash" in pending, false);
  Object.assign(
    m.state.shots[0],
    { decision },
    keeperMove({ x: 0.8, y: 0.8 }, decision.choice),
  );
  record(m.state, 1, { x: 0.8, y: 0.8 });
  assert.equal(publicGame(m, { attempts: 1, goals: 1 }).ready, true);
});
