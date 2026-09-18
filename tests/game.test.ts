import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveShot, record, publicGame } from "../typescript/src/game";
import type { Match, Decision, State } from "../shared/types";
const decision: Decision = {
  choice: "left_low",
  probabilities: { left_low: 1 },
  confidence: 1,
  model: "test",
  durationMs: 1,
  history: [],
};
const state = (): State => ({
  shots: [{ number: 1, decision: structuredClone(decision) }],
  finished: false,
});
test("a correctly covered target is saved; an uncovered target scores", () => {
  assert.equal(resolveShot({ x: -0.62, y: 0.25 }, "left_low").outcome, "saved");
  assert.equal(resolveShot({ x: 0.8, y: 0.8 }, "left_low").outcome, "goal");
});
test("wide, over, and below-goal shots keep the keeper standing", () => {
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
test("identical retries preserve the same shot and time", () => {
  const s = state();
  const first = structuredClone(record(s, 1, { x: 0.8, y: 0.8 }));
  assert.deepEqual(record(s, 1, { x: 0.8, y: 0.8 }), first);
  assert.equal(s.shots.length, 1);
});
test("conflicting retries and out-of-order shots are rejected", () => {
  const s = state();
  record(s, 1, { x: 0.8, y: 0.8 });
  assert.throws(() => record(s, 1, { x: 0, y: 0.3 }), /committed/);
  assert.throws(() => record(s, 2, { x: 0, y: 0.3 }), /ready/);
});
test("the API view never exposes an upcoming decision", () => {
  const m: Match = {
    id: "test",
    name: "Guest",
    owner_hash: "hidden",
    state: state(),
  };
  const g = publicGame(m, { attempts: 0, goals: 0 });
  assert.equal(g.ready, true);
  assert.deepEqual(g.shots, []);
  assert.equal("owner_hash" in g, false);
  record(m.state, 1, { x: 0.8, y: 0.8 });
  m.state.shots.push({ number: 2, decision });
  const result = publicGame(m, { attempts: 1, goals: 1 });
  assert.equal(result.shots.length, 1);
  assert.equal(result.goals, 1);
});
