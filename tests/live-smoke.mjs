import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.argv[2] || "http://127.0.0.1:3101";
const token = randomUUID(),
  other = randomUUID(),
  matchId = randomUUID(),
  runs = [];
const request = async (path, body, auth = token) => {
  const r = await fetch(base + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + auth,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(predicate) {
  for (let i = 0; i < 120; i++) {
    const g = await request("/matches/" + matchId);
    if (g.status === 200 && predicate(g.data)) return g.data;
    await pause(500);
  }
  throw Error("Match timed out.");
}
async function play(body) {
  const start = Date.now();
  const r = await request("/play", body);
  assert.equal(r.status, 202, JSON.stringify(r.data));
  runs.push(r.data.runId);
  return { ...r.data, start };
}
const startBody = { action: "start", matchId, name: "Smoke test" };
let run = await play(startBody);
let g = await waitFor((g) => g.ready);
console.log("Ready", Date.now() - run.start, "ms");
assert.deepEqual(g.shots, []);
assert.equal(
  (await request("/matches/" + matchId, undefined, other)).status,
  404,
);
assert.equal(
  (await request("/runs/" + run.runId, undefined, other)).status,
  404,
);
await play(startBody);
await pause(500);
assert.equal((await request("/matches/" + matchId)).data.attempts, 0);
const targets = [
  { x: 1.25, y: 0.5 },
  { x: 0.93, y: 0.92 },
  { x: -0.62, y: 0.25 },
  { x: 0.62, y: 0.25 },
  { x: 0, y: 0.76 },
];
for (let number = 1; number <= 5; number++) {
  const body = { action: "shoot", matchId, number, aim: targets[number - 1] };
  run = await play(body);
  g = await waitFor((g) => g.attempts === number);
  const shot = g.shots[number - 1];
  console.log(
    "Penalty",
    number,
    shot.outcome,
    "recorded",
    Date.now() - run.start,
    "ms",
    "Jev",
    shot.decision.durationMs,
    "ms",
  );
  assert.equal(g.shots.length, number);
  assert.deepEqual(
    shot.decision.state.ball.projectedCrossing,
    targets[number - 1],
  );
  assert.ok(shot.decision.model.startsWith("jev"));
  if (number === 2) assert.equal(shot.outcome, "goal");
  if (number === 1) {
    assert.equal(shot.outcome, "wide");
    assert.deepEqual(shot.keeper, { x: 0, y: 0.4 });
  }
  g = await waitFor((g) => (number === 5 ? g.finished : g.ready));
  if (number === 2) {
    const before = JSON.stringify(g.shots);
    const duplicated = await Promise.all([
      request("/play", body),
      request("/play", body),
    ]);
    assert.ok(duplicated.every((r) => r.status === 202));
    await pause(1500);
    g = (await request("/matches/" + matchId)).data;
    assert.equal(JSON.stringify(g.shots), before);
    assert.equal(
      (await request("/play", { ...body, aim: { x: 0, y: 0.4 } })).status,
      409,
    );
  }
}
assert.equal(g.attempts, 5);
assert.equal(g.ready, false);
assert.equal(g.finished, true);
assert.equal(g.totalAttempts, 5);
assert.equal(
  (
    await request("/play", {
      action: "shoot",
      matchId,
      number: 6,
      aim: { x: 0, y: 0.5 },
    })
  ).status,
  400,
);
await pause(500);
const traces = [];
for (const id of runs) {
  const result = await request("/runs/" + id);
  assert.equal(result.status, 200);
  traces.push(result.data);
}
assert.ok(
  traces.some((t) => t.spans.some((s) => s.name === "goalkeeper_action")),
);
assert.ok(traces.some((t) => t.spans.some((s) => s.name === "record_result")));
assert.ok(traces.some((t) => t.spans.some((s) => s.name === "finish_match")));
await mkdir("work", { recursive: true });
const lang = (await request("/health")).data.language;
await writeFile(
  `work/live-${lang}.json`,
  JSON.stringify({ base, matchId, game: g, traces }, null, 2),
);
console.log(
  lang,
  "PASS: five penalties, retry/concurrency, ownership, locked targets, real Jev, and task trace.",
);
