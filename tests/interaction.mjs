import { chromium, expect } from "@playwright/test";
import * as THREE from "three";
import assert from "node:assert/strict";
const url = process.env.DEMO_URL || "http://127.0.0.1:5183";
const mobile = process.env.MOBILE === "1";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: mobile
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 },
  hasTouch: mobile,
  isMobile: mobile,
});
const cdp = mobile ? await page.context().newCDPSession(page) : null;
let touching = false;
const touch = async (type, p) => {
  if (type === "touchEnd" && !touching) return;
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: p ? [{ x: p.x, y: p.y, radiusX: 3, radiusY: 3, force: 1, id: 1 }] : [],
  });
  touching = type !== "touchEnd";
};
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
const phase = (turn, view, ready = false) => page.waitForFunction(
  ({ turn, view, ready }) => {
    const pitch = document.querySelector(".stage");
    return pitch?.dataset.turn === String(turn) && pitch?.dataset.phase === view &&
      (!ready || pitch?.dataset.ready === "true");
  }, { turn, view, ready }, { timeout: 70000 },
);
async function recorded(number) {
  await expect.poll(() => games.at(-1)?.shots.some(s => s.number === number), { timeout: 15000 }).toBe(true);
  return games.at(-1).shots.find(s => s.number === number);
}
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
await phase(1, "aim", true);
const prefix = mobile ? "mobile" : "desktop";
await page.screenshot({
  path: `work/${prefix}-shootout-ready.png`,
  fullPage: true,
});
for (let round = 1; round <= 5; round++) {
  await phase(round * 2 - 1, "aim", true);
  assert.equal(await page.getByRole("button", { name: /^(Shoot|Ready in goal|Keep goal|Your kick)$/ }).count(), 0);
  const responsePromise = page.waitForResponse(
    r => r.url().endsWith("/api/play") && r.request().postDataJSON().action === "ready",
    { timeout: 70000 },
  );
  const box = await page.locator("canvas").boundingBox();
  if (round === 1) {
    const p = project([0, -0.04, -6], box);
    if (mobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  } else if (round === 2) {
    const points = [
      [0, 0.14, 4.5],
      [-0.8, 1.1, 2],
      [-1.1, 1.8, -1],
      [3.3, 2.2, -6],
    ].map((p) => project(p, box));
    if (mobile) {
      await touch("touchStart", points[0]);
      for (const p of points.slice(1)) {
        await touch("touchMove", p);
        await page.waitForTimeout(40);
      }
    } else {
      await page.mouse.move(points[0].x, points[0].y);
      await page.mouse.down();
      for (const p of points.slice(1))
        await page.mouse.move(p.x, p.y, { steps: 8 });
    }
    await page.screenshot({
      path: `work/${prefix}-drawn-path.png`,
      fullPage: true,
    });
    if (mobile) await touch("touchEnd");
    else await page.mouse.up();
  } else {
    delay = round === 3;
    abortShot = round === 4;
    await page.locator(".stage").focus();
    await page.keyboard.press("Space");
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
  await phase(round * 2 - 1, "result");
  delay = false;
  const human = await recorded(round * 2 - 1);
  if (round === 1) {
    assert.equal(human.aim.y, 0.06);
    assert.notEqual(human.outcome, "wide");
    assert.ok(
      delivered.get(1) < 1480,
      "Jev reaction reaches browser during flight",
    );
  }
  if (round === 2) assert.ok(human.path.length >= (mobile ? 4 : 6));
  if (round === 3) {
    assert.equal(human.reaction, "late");
    assert.equal(human.outcome, "goal");
  }
  if (round === 1) {
    // Pause when reading away from the pitch, including the desktop help dialog.
    if (mobile) await page.locator("footer").scrollIntoViewIfNeeded();
    else await page.getByRole("button", { name: "How it works", exact: true }).click();
    await page.waitForTimeout(3000);
    assert.equal(commands.filter(c => c.action === "ready").length, 0);
    if (mobile) await page.locator(".stage").scrollIntoViewIfNeeded();
    else await page.getByRole("button", { name: "Close How it works", exact: true }).click();
  }
  await phase(round * 2, "aim");
  await page.locator(".turn-countdown").waitFor({ state: "visible" });
  assert.notEqual(await page.locator(".execution-status").innerText(), "Sending your shot…");
  if (round === 2) {
    await page.reload();
    await phase(round * 2, "aim");
    await page.locator(".turn-countdown").waitFor({ state: "visible" });
  }
  if (round === 3) {
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(2300);
    assert.equal(commands.filter(c => c.action === "ready").length, round - 1);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.locator(".turn-countdown").waitFor({ state: "visible" });
  }
  assert.ok(games.at(-1).incomingShot == null, "Target stays hidden before automatic release");
  if (round === 1) await page.screenshot({ path: `work/${prefix}-countdown.png`, fullPage: true });
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
    if (travel) {
      await touch("touchStart", { x: b.x + b.width / 2, y: b.y + b.height / 2 });
      await page.waitForTimeout(travel);
      await touch("touchEnd");
    }
    if (attack.aim.y > 0.5) {
      const jump = await page
        .getByRole("button", { name: "Keeper jump", exact: true })
        .boundingBox();
      await touch("touchStart", { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2 });
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
  await phase(round * 2, "result");
  await page.keyboard.up("Space");
  if (mobile) await touch("touchEnd");
  await page.mouse.up();
  const defended = await recorded(round * 2);
  assert.equal(
    defended.outcome,
    "saved",
    `Human can move to save ${JSON.stringify({ aim: attack.aim, keeper: defended.keeper })}`,
  );
  assert.equal(
    await page.getByRole("status").innerText(),
    round === 5 ? "YOU WIN" : "YOU SAVED IT",
  );

}
assert.equal(
  commands.filter((c) => c.action === "start").length,
  1,
  "One start request owns whole game",
);
await enabled("Try again");
assert.equal(commands.filter(c => c.action === "ready").length, 5, "Each Jev shot releases exactly once without a button");
assert.equal(commands.filter(c => c.action === "defend").length, 5);
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
await phase(1, "aim", true);
assert.notEqual(await page.locator(".match-run-id code").textContent(), root);
assert.deepEqual(errors, []);
console.log(
  prefix,
  "PASS: ten automatic turns, countdowns, offscreen pause, no turn buttons, center target, drawing, late decision, keeper controls, retries, scores, workflow tree, reload and new match. Normal delivery",
  delivered.get(1),
  "ms",
);
await browser.close();
