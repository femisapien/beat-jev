import { chromium } from "@playwright/test";
import * as THREE from "three";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const url = process.env.DEMO_URL || "http://127.0.0.1:5183";
const commands = [],
  games = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", async (r) => {
  if (r.ok() && r.url().includes("/api/matches/"))
    try {
      games.push(await r.json());
    } catch {}
});
let delay = false;
await page.route("**/api/play", async (route) => {
  const b = route.request().postDataJSON();
  if (b.action === "shoot") {
    commands.push(b);
    if (delay) await new Promise((r) => setTimeout(r, 1200));
  }
  await route.continue();
});
await page.goto(url);
await page
  .getByRole("textbox", { name: "Player name" })
  .fill("Interaction test");
await page.getByRole("button", { name: "Play", exact: true }).click();
const enabled = async (name) => {
  await page.waitForFunction(
    (n) =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim() === n && !b.disabled,
      ),
    name,
    { timeout: 60000 },
  );
};
await enabled("Shoot");
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
const box = await page.locator("canvas").boundingBox();
const center = project([0, -0.04, -6], box);
await page.mouse.click(center.x, center.y);
await enabled("Next shot");
assert.ok(Math.abs(commands[0].aim.x) < 0.005);
assert.equal(commands[0].aim.y, 0.06);
assert.notEqual(games.at(-1).shots[0].outcome, "wide");
await page.screenshot({ path: "work/center-fixed.png", fullPage: true });
await page.getByRole("button", { name: "Next shot", exact: true }).click();
const points = [
  [0, 0.14, 4.5],
  [-0.8, 1.1, 2],
  [-1.1, 1.8, -1],
  [3.3, 2.2, -6],
].map((p) => project(p, box));
await page.mouse.move(points[0].x, points[0].y);
await page.mouse.down();
for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: 8 });
await page.screenshot({ path: "work/drawn-path.png", fullPage: true });
await page.mouse.up();
await page.waitForTimeout(400);
assert.equal(
  await page.getByRole("status").count(),
  0,
  "No result text before the ball arrives",
);
await page.screenshot({ path: "work/drawn-flight.png", fullPage: true });
await enabled("Next shot");
assert.ok(commands[1].path.length > 5);
assert.ok(commands[1].path.some((p) => p.x < -0.1));
assert.deepEqual(games.at(-1).shots[1].path, commands[1].path);
await page.getByRole("button", { name: "Next shot", exact: true }).click();
delay = true;
const target = project([0, 1.1, -6], box);
await page.mouse.click(target.x, target.y);
await page.waitForTimeout(400);
assert.ok(
  (await page.locator(".turn-status").innerText()).includes("Ball in play"),
);
assert.equal(await page.getByRole("status").count(), 0);
await page.screenshot({ path: "work/kick-before-request.png", fullPage: true });
await enabled("Next shot");
const late = games.at(-1).shots[2];
assert.equal(late.reaction, "late");
assert.equal(late.outcome, "goal");
assert.equal(late.keeperAction, "hold");
delay = false;
await page.getByRole("button", { name: "Next shot", exact: true }).click();
const over = project([0, 3.1, -6], box);
await page.mouse.click(over.x, over.y);
await enabled("Next shot");
assert.equal(await page.getByRole("status").innerText(), "OVER");
assert.equal(games.at(-1).shots[3].keeperAction, "hold");
assert.deepEqual(errors, []);
await page.screenshot({ path: "work/late-reaction.png", fullPage: true });
console.log(
  "PASS: center grass tap stays in goal, drawn path stored, no premature result, kick begins before delayed request, late reaction cannot save.",
);
await browser.close();
