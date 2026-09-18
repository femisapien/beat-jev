import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.argv[2] || "http://127.0.0.1:3101",
  token = randomUUID(),
  matchId = randomUUID();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function request(path, body, auth = token) {
  const r = await fetch(base + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + auth,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
async function waitFor(test) {
  for (let i = 0; i < 160; i++) {
    const r = await request("/matches/" + matchId);
    if (r.status === 200 && test(r.data)) return r.data;
    await pause(200);
  }
  throw Error("Timed out waiting for match.");
}
const start = { action: "start", matchId, name: "Shootout test" };
const root = await request("/play", start);
assert.equal(root.status, 202, JSON.stringify(root.data));
const again = await Promise.all([
  request("/play", start),
  request("/play", start),
]);
assert.ok(
  again.every((r) => r.data.runId === root.data.runId),
  "Only one root per match, including concurrent retries",
);
let g = await waitFor((g) => g.turn?.ready);
assert.equal(
  (await request("/matches/" + matchId, undefined, randomUUID())).status,
  404,
);
assert.equal(
  (await request("/runs/" + root.data.runId, undefined, randomUUID())).status,
  404,
);
for (let number = 1; number <= 10; number++) {
  g = await waitFor((g) => g.turn?.number === number && g.turn.ready);
  assert.equal(g.turn.shooter, number % 2 ? "player" : "jev");
  assert.ok(!g.incomingShot, "Jev target hidden until ready");
  let body;
  if (number % 2) {
    body = {
      action: "shoot",
      matchId,
      number,
      aim: number === 1 ? { x: 1.25, y: 0.5 } : { x: -0.62, y: 0.25 },
    };
    if (number === 3) {
      body.kick = { power: 1, curl: 1 };
      body.path = [
        { x: 0, y: 0.06 },
        { x: 4, y: 5 },
        { x: -4, y: 4 },
        body.aim,
      ];
      assert.equal(
        (await request("/play", { ...body, kick: { power: 2, curl: 1 } }))
          .status,
        400,
      );
    }
    const started = Date.now();
    assert.equal((await request("/play", body)).status, 202);
    g = await waitFor(
      (g) =>
        g.activeShot?.number === number ||
        g.shots.some((s) => s.number === number),
    );
    console.log("Reaction", number, Date.now() - started, "ms");
  } else {
    if (number === 2)
      assert.equal(
        (
          await request("/play", {
            action: "shoot",
            matchId,
            number,
            aim: { x: 0, y: 0.25 },
          })
        ).status,
        409,
      );
    const released = await request("/play", {
      action: "ready",
      matchId,
      number,
    });
    assert.equal(released.status, 202, JSON.stringify(released.data));
    const shot = released.data.attack;
    assert.ok(shot.decision.model.startsWith("jev"));
    assert.equal(shot.decision.state.history.length, number / 2 - 1);
    assert.ok(!("currentGoalkeeper" in shot.decision.state));
    if (number === 2) {
      const duplicate = await request("/play", {
        action: "ready",
        matchId,
        number,
      });
      assert.deepEqual(
        duplicate.data.attack,
        shot,
        "Jev target cannot change on retry",
      );
    }
    await pause(1480);
    const aim =
      number === 4
        ? { x: -shot.aim.x, y: shot.aim.y === 0.25 ? 0.76 : 0.25 }
        : shot.aim;
    body = { action: "defend", matchId, number, aim };
    assert.equal((await request("/play", body)).status, 202);
  }
  g = await waitFor((g) => g.attempts === number);
  const shot = g.shots.at(-1);
  assert.equal(shot.shooter, number % 2 ? "player" : "jev");
  if (number === 1) assert.equal(shot.outcome, "wide");
  if (number % 2) {
    assert.equal(
      shot.path.length,
      17,
      "Server replaces arbitrary paths with a bounded flight",
    );
    if (shot.decision) {
      assert.equal(shot.decision.state.observedMs, 160);
      assert.equal(shot.decision.state.ball.at(-1).ms, 160);
      assert.ok(
        shot.reactionMs >= 340,
        "Observation cannot precede run-up and observed flight",
      );
      assert.ok(
        !JSON.stringify(shot.decision.state).includes("projectedCrossing"),
      );
    }
  }
  if (number === 3) {
    assert.deepEqual(shot.kick, { power: 1, curl: 1 });
    assert.ok(shot.path.every((p) => Math.abs(p.x) < 2));
    assert.equal(
      (await request("/play", { ...body, kick: { power: 0.5, curl: 1 } }))
        .status,
      409,
    );
  }
  if (number % 2 === 0)
    assert.equal(shot.outcome, number === 4 ? "goal" : "saved");
  if (number <= 2) {
    const before = JSON.stringify(g.shots);
    assert.equal((await request("/play", body)).status, 202);
    assert.equal(
      (await request("/play", { ...body, aim: { x: 0.1, y: 0.25 } })).status,
      409,
    );
    g = (await request("/matches/" + matchId)).data;
    assert.equal(JSON.stringify(g.shots), before);
  }
  console.log(
    "Turn",
    number,
    shot.shooter,
    shot.outcome,
    "score",
    g.goals,
    g.jevGoals,
  );
}
g = await waitFor((g) => g.finished);
assert.equal(g.attempts, 10);
assert.equal(g.totalAttempts, 5);
assert.equal(g.jevGoals, 1);
let trace;
for (let i = 0; i < 40; i++) {
  trace = (await request("/runs/" + root.data.runId)).data;
  if (trace.status === "completed") break;
  await pause(400);
}
assert.equal(trace.status, "completed");
assert.equal(
  trace.spans.find((s) => s.id === root.data.runId).name,
  "run_game",
);
const turns = trace.spans
  .filter((s) => s.name === "take_penalty")
  .sort((a, b) => a.number - b.number);
assert.equal(turns.length, 10);
assert.ok(turns.every((t) => t.parentId === root.data.runId));
for (let i = 0; i < 10; i++) {
  const t = turns[i],
    children = trace.spans.filter((s) => s.parentId === t.id);
  const kick = children.find(
    (s) => s.name === (t.number % 2 ? "player_kick" : "jev_kick"),
  );
  const keeper = children.find(
    (s) => s.name === (t.number % 2 ? "goalkeeper_action" : "player_save"),
  );
  assert.ok(kick && keeper && children.find((s) => s.name === "record_result"));
  assert.ok(
    Date.parse(kick.startedAt) < Date.parse(keeper.completedAt) &&
      Date.parse(keeper.startedAt) < Date.parse(kick.completedAt),
    "Parallel children overlap",
  );
  if (i)
    assert.ok(
      Date.parse(t.startedAt) >= Date.parse(turns[i - 1].completedAt),
      "Turns execute sequentially",
    );
}
const lang = (await request("/health")).data.language;
await mkdir("work", { recursive: true });
await writeFile(
  `work/live-${lang}.json`,
  JSON.stringify({ base, matchId, game: g, trace }, null, 2),
);
console.log(
  lang,
  "PASS: one root, ten alternating turns, nested parallel tasks, hidden committed targets, save/goal scoring, retry safety, ownership, completion.",
);
