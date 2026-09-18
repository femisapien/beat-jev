// Calls the real TypeSafe API. Run explicitly: node --env-file=.env --import tsx tests/keeper-live.ts
import assert from "node:assert/strict";
import { decideKeeper } from "../typescript/src/keeper";
import { observeBall, defaultKick } from "../shared/flight";
import config from "../shared/game.json";
const cases = [
  ...Object.entries(config.zones).map(([expected, z]) => ({
    expected,
    aim: { x: z.x, y: z.y },
  })),
  ...[
    { x: 1.2, y: 0.5 },
    { x: -1.2, y: 0.5 },
    { x: 0, y: 1.2 },
    { x: 0, y: -0.1 },
  ].map((aim) => ({ expected: "leave_wide", aim })),
  { expected: "left_high", aim: { x: -0.92, y: 0.92 } },
  { expected: "right_high", aim: { x: 0.92, y: 0.92 } },
  { expected: "left_low", aim: { x: -0.9, y: 0.09 } },
  { expected: "right_low", aim: { x: 0.9, y: 0.09 } },
  { expected: "center_low", aim: { x: -0.08, y: 0.18 } },
  { expected: "center_high", aim: { x: 0.09, y: 0.9 } },
  {
    expected: "left_low",
    aim: { x: -0.62, y: 0.25 },
    kick: { power: 0.6, curl: 1 },
  },
  {
    expected: "right_high",
    aim: { x: 0.62, y: 0.76 },
    kick: { power: 1, curl: -1 },
  },
];
let correct = 0;
for (const c of cases) {
  const d = await decideKeeper(
    observeBall(c.aim, "kick" in c ? c.kick : defaultKick),
  );
  correct += +(d.choice === c.expected);
  assert.ok(d.choice in config.criteria);
  assert.equal(d.state.observedMs, 160);
  assert.ok(!JSON.stringify(d.state).includes("projectedCrossing"));
  console.log(
    JSON.stringify({
      aim: c.aim,
      curl: "kick" in c ? c.kick.curl : 0,
      estimate: d.state.estimate,
      expected: c.expected,
      choice: d.choice,
      confidence: d.confidence,
      durationMs: d.durationMs,
      model: d.model,
    }),
  );
  assert.ok(
    Math.abs(Object.values(d.probabilities).reduce((a, b) => a + b, 0) - 1) <
      0.06,
  );
}
console.log(`Keeper actions: ${correct}/${cases.length} matched`);
// Partial observations can be wrong. Keep prediction quality visible instead of
// turning expected model mistakes into a deterministic test of ground truth.
console.log(
  "Accuracy is diagnostic; the game must apply the returned action, including mistakes.",
);
