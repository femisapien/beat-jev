import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  ballAt,
  defaultKick,
  flightMs,
  flightPath,
  observeBall,
  keeperObservation,
} from "../shared/flight";
import { kickFromGesture } from "../frontend/src/gesture";
import config from "../shared/game.json";

test("arbitrary scribbles produce a bounded bend, never additional waypoints", () => {
  const scribble = Array.from({ length: 1000 }, (_, i) => ({
    x: Math.sin(i) * 10000,
    y: Math.cos(i) * 10000,
  }));
  const kick = kickFromGesture(scribble, 1, 390);
  assert.ok(kick.power >= 0.2 && kick.power <= 1);
  assert.ok(Math.abs(kick.curl) <= 1);
  assert.deepEqual(
    kickFromGesture(
      [
        { x: 10, y: 10 },
        { x: 12, y: 11 },
      ],
      100,
      390,
    ),
    defaultKick,
  );
  const aim = { x: 0.8, y: 0.6 },
    path = flightPath(aim, kick);
  assert.equal(path.length, 17);
  for (let i = 0; i <= 100; i++) {
    const t = i / 100,
      p = ballAt(aim, kick, t);
    assert.ok(Math.abs(p.x - aim.x * 3.66 * t) <= 0.651);
    assert.ok(p.z >= -6 && p.z <= 4.5);
    if (i) assert.ok(p.z < ballAt(aim, kick, (i - 1) / 100).z);
  }
  assert.ok(Math.abs(path.at(-1)!.x - aim.x) < 1e-12);
  assert.ok(Math.abs(path.at(-1)!.y - aim.y) < 1e-12);
});

test("power changes flight time and the observation uses only elapsed frames", () => {
  assert.ok(
    flightMs({ power: 1, curl: 0 }) < flightMs({ power: 0.2, curl: 0 }),
  );
  const samples = observeBall({ x: 0.8, y: 0.5 });
  assert.deepEqual(
    samples.map((p) => p.ms),
    [0, 80, 160],
  );
  assert.ok(samples.every((p) => p.distanceToGoal > 9));
  assert.equal(samples.at(-1)!.ms, config.observationMs);
});

test("model state excludes target, gesture and future samples; its estimate can be fooled", () => {
  const aim = { x: -0.62, y: 0.25 };
  const straight = keeperObservation(observeBall(aim));
  const curled = keeperObservation(observeBall(aim, { power: 0.6, curl: 1 }));
  assert.ok(straight.estimate.horizontalRange[1] < -1.1);
  assert.ok(
    curled.estimate.horizontalRange[0] > -1.1,
    "same target, different early movement and estimate",
  );
  const state = JSON.stringify(curled);
  for (const forbidden of [
    "projectedCrossing",
    "trajectory",
    "on target",
    "left_low",
    'curl":',
    'power":',
  ])
    assert.ok(!state.includes(forbidden));
  const injected = observeBall(aim).map((p) => ({
    ...p,
    aim,
    future: "not observed",
  }));
  assert.deepEqual(keeperObservation(injected), straight);
});

test("Python and TypeScript simulate identical trajectories and observation ranges", () => {
  const cases = [-0.9, 0, 0.9].flatMap((x) =>
    [0.06, 0.76, 1.2].flatMap((y) =>
      [-1, 0, 1].map((curl) => ({ aim: { x, y }, kick: { power: 0.8, curl } })),
    ),
  );
  const script =
    'import json,sys; from app.flight import flight_path,observe_ball,keeper_observation; print(json.dumps([dict(path=flight_path(c["aim"],c["kick"]),state=keeper_observation(observe_ball(c["aim"],c["kick"]))) for c in json.load(sys.stdin)]))';
  const python = JSON.parse(
    execFileSync("python3", ["-c", script], {
      input: JSON.stringify(cases),
      env: { ...process.env, PYTHONPATH: "python" },
      encoding: "utf8",
    }),
  );
  cases.forEach((c, i) => {
    const expected = {
      path: flightPath(c.aim, c.kick),
      state: keeperObservation(observeBall(c.aim, c.kick)),
    };
    const compare = (a: any, b: any) => {
      if (typeof a === "number")
        assert.ok(Math.abs(a - b) < 0.011, `${a} vs ${b}`);
      else if (a && typeof a === "object") {
        assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
        for (const k in a) compare(a[k], b[k]);
      } else assert.equal(a, b);
    };
    compare(expected, python[i]);
  });
});
