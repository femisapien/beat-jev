import { test } from "node:test";
import assert from "node:assert/strict";
import { impactMs, keeperMotion, type Playback } from "../frontend/src/playback";

const flight: Playback = {
  number: 1,
  aim: { x: 0.8, y: 0.9 },
  path: [],
  startedAt: 1000,
  keeperStartedAt: 1350,
  reaction: {
    number: 1,
    aim: { x: 0.8, y: 0.9 },
    keeper: { x: 0.62, y: 0.76 },
    keeperAction: "dive",
    outcome: "saved",
  },
};
test("fast decisions wait for the ball and finish the dive at impact", () => {
  assert.equal(keeperMotion(flight, 1800)!.progress, 0);
  const middle = keeperMotion(flight, 2155)!.progress;
  assert.ok(middle > 0.4 && middle < 0.6);
  assert.ok(keeperMotion(flight, 1000 + impactMs - 50)!.progress < 1);
  assert.equal(keeperMotion(flight, 1000 + impactMs)!.progress, 1);
});
test("saved shots do not redirect the keeper from the chosen zone", () => {
  const first = keeperMotion(flight, 3000)!;
  const changedAim = {
    ...flight,
    aim: { x: 0.45, y: 0.55 },
    reaction: { ...flight.reaction!, aim: { x: 0.45, y: 0.55 } },
  };
  assert.deepEqual(first.target, { x: 0.62, y: 0.76 });
  assert.deepEqual(keeperMotion(changedAim, 3000)!.target, first.target);
});
test("a delayed response cannot teleport or move the keeper before receipt", () => {
  const late = { ...flight, keeperStartedAt: 2400 };
  assert.equal(keeperMotion(late, 2399)!.progress, 0);
  assert.equal(keeperMotion(late, 2400)!.progress, 0);
  assert.ok(keeperMotion(late, 2480)!.progress < 0.1);
  assert.equal(keeperMotion(late, 2850)!.progress, 1);
});
test("no decision or a hold leaves the keeper in place", () => {
  assert.equal(keeperMotion(null, 3000), null);
  assert.equal(keeperMotion({ ...flight, reaction: undefined }, 3000), null);
  assert.equal(
    keeperMotion({ ...flight, reaction: { number: 1, keeperAction: "hold" } }, 3000),
    null,
  );
  assert.equal(
    keeperMotion({ ...flight, keeperStartedAt: undefined }, 3000)!.progress,
    0,
  );
});
test("reduced motion uses the chosen zone only after a decision arrives", () => {
  assert.equal(keeperMotion(flight, 1349, true)!.progress, 0);
  assert.equal(keeperMotion(flight, 1350, true)!.progress, 1);
});
