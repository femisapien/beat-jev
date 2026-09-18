import { chromium } from "@playwright/test";
import * as THREE from "three";
import assert from "node:assert/strict";
const url = process.env.DEMO_URL || "http://127.0.0.1:5183";
const mobile = process.env.MOBILE === "1";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: mobile
    ? { width: 390, height: 844 }
    : { width: 1440, height: 1050 },
  hasTouch: mobile,
});
const games = [],
  commands = [],
  errors = [],
  delivered = new Map(),
  released = new Map();
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", async (r) => {
  if (r.ok() && r.url().includes("/api/matches/")) {
    try {
      const g = await r.json();
      games.push(g);
      if (
        g.activeShot &&
        released.has(g.activeShot.number) &&
        !delivered.has(g.activeShot.number)
      )
        delivered.set(
          g.activeShot.number,
          Date.now() - released.get(g.activeShot.number),
        );
    } catch {}
  }
});
let delay = false,
  abortShot = false;
await page.route("**/api/play", async (route) => {
  const b = route.request().postDataJSON();
  commands.push(b);
  if (b.action === "shoot") {
    if (abortShot) {
      abortShot = false;
      await route.abort("failed");
      return;
    }
    released.set(b.number, Date.now());
    if (delay) await new Promise((r) => setTimeout(r, 1200));
  }
  await route.continue();
});
const enabled = async (name) => {
  await page.waitForFunction(
    (n) =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim() === n && !b.disabled,
      ),
    name,
    { timeout: 70000 },
  );
};
function project(v, box) {
  const cam = new THREE.PerspectiveCamera(
    Math.max(
      24,
      THREE.MathUtils.radToDeg(
        2 * Math.atan(6.3 / (23 * (box.width / box.height))),
      ),
    ),
    box.width / box.height,
    0.1,
    100,
  );
  cam.position.set(0, 4.5, 17);
  cam.lookAt(0, 0.65, 0.5);
  cam.updateMatrixWorld();
  const p = new THREE.Vector3(...v).project(cam);
  return {
    x: box.x + ((p.x + 1) * box.width) / 2,
    y: box.y + ((1 - p.y) * box.height) / 2,
  };
}
await page.goto(url);
await page.getByRole("textbox", { name: "Player name" }).fill("Shootout UI");
await page.getByRole("button", { name: "Play", exact: true }).click();
await enabled("Shoot");
const prefix = mobile ? "mobile" : "desktop";
await page.screenshot({
  path: `work/${prefix}-shootout-ready.png`,
  fullPage: true,
});
for (let round = 1; round <= 5; round++) {
  await enabled("Shoot");
  const box = await page.locator("canvas").boundingBox();
  if (round === 1) {
    const p = project([0, -0.04, -6], box);
    await page.mouse.click(p.x, p.y);
  } else if (round === 2) {
    const points = [
      [0, 0.14, 4.5],
      [-0.8, 1.1, 2],
      [-1.1, 1.8, -1],
      [3.3, 2.2, -6],
    ].map((p) => project(p, box));
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (const p of points.slice(1))
      await page.mouse.move(p.x, p.y, { steps: 8 });
    await page.screenshot({
      path: `work/${prefix}-drawn-path.png`,
      fullPage: true,
    });
    await page.mouse.up();
  } else {
    delay = round === 3;
    abortShot = round === 4;
    await page.getByRole("button", { name: "Shoot", exact: true }).click();
  }
  await page.waitForTimeout(250);
  assert.equal(
    await page.getByRole("status").count(),
    0,
    "Result must wait for ball arrival",
  );
  if (round === 4) {
    await enabled("Retry");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
  }
  await enabled("Keep goal");
  delay = false;
  const human = games.at(-1).shots.find((s) => s.number === round * 2 - 1);
  if (round === 1) {
    assert.equal(human.aim.y, 0.06);
    assert.notEqual(human.outcome, "wide");
    assert.ok(
      delivered.get(1) < 1480,
      "Jev reaction reaches browser during flight",
    );
  }
  if (round === 2) assert.ok(human.path.length > 5);
  if (round === 3) {
    assert.equal(human.reaction, "late");
    assert.equal(human.outcome, "goal");
  }
  await page.getByRole("button", { name: "Keep goal", exact: true }).click();
  await enabled("Ready in goal");
  assert.equal(
    games.at(-1).incomingShot,
    null == games.at(-1).incomingShot ? games.at(-1).incomingShot : undefined,
    "Target stays hidden before release",
  );
  const responsePromise = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/play") &&
      r.request().postDataJSON().action === "ready",
  );
  await page
    .getByRole("button", { name: "Ready in goal", exact: true })
    .click();
  const attack = (await (await responsePromise).json()).attack;
  await page.waitForTimeout(60);
  const direction = attack.aim.x < 0 ? "ArrowLeft" : "ArrowRight";
  const travel = (Math.abs(attack.aim.x) / 1.6) * 1000;
  if (mobile) {
    const button = page.getByRole("button", {
      name: `Keeper ${attack.aim.x < 0 ? "left" : "right"}`,
      exact: true,
    });
    const b = await button.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    if (travel) {
      await page.mouse.down();
      await page.waitForTimeout(travel);
      await page.mouse.up();
    }
    if (attack.aim.y > 0.5) {
      const jump = await page
        .getByRole("button", { name: "Keeper jump", exact: true })
        .boundingBox();
      await page.mouse.move(jump.x + jump.width / 2, jump.y + jump.height / 2);
      await page.mouse.down();
    }
  } else {
    if (travel) {
      await page.keyboard.down(direction);
      await page.waitForTimeout(travel);
      await page.keyboard.up(direction);
    }
    if (attack.aim.y > 0.5) await page.keyboard.down("Space");
  }
  if (round === 1)
    await page.screenshot({
      path: `work/${prefix}-human-keeper.png`,
      fullPage: true,
    });
  await enabled(round === 5 ? "Try again" : "Your kick");
  await page.keyboard.up("Space");
  await page.mouse.up();
  const defended = games.at(-1).shots.find((s) => s.number === round * 2);
  assert.equal(
    defended.outcome,
    "saved",
    `Human can move to save ${JSON.stringify({ aim: attack.aim, keeper: defended.keeper })}`,
  );
  assert.equal(
    await page.getByRole("status").innerText(),
    round === 5 ? "YOU WIN" : "YOU SAVED IT",
  );
  if (round < 5)
    await page.getByRole("button", { name: "Your kick", exact: true }).click();
}
assert.equal(
  commands.filter((c) => c.action === "start").length,
  1,
  "One start request owns whole game",
);
assert.equal(games.at(-1).attempts, 10);
assert.equal(games.at(-1).jevGoals, 0);
assert.equal(await page.locator(".match-run-id").count(), 1);
assert.equal(await page.locator(".execution-run > summary").count(), 10);
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  "No horizontal overflow",
);
const root = await page.locator(".match-run-id code").textContent();
await page.screenshot({
  path: `work/${prefix}-shootout-complete.png`,
  fullPage: true,
});
await page.reload();
await enabled("Try again");
assert.equal(await page.locator(".match-run-id code").textContent(), root);
await page.getByRole("button", { name: "Try again", exact: true }).click();
await enabled("Shoot");
assert.notEqual(await page.locator(".match-run-id code").textContent(), root);
assert.deepEqual(errors, []);
console.log(
  prefix,
  "PASS: ten alternating turns, center target, drawing, immediate release, late decision, keeper movement/jump, scores, nested task UI, reload and new match. Normal delivery",
  delivered.get(1),
  "ms",
);
await browser.close();
