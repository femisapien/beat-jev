import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome" });
const url = process.env.DEMO_URL || "http://127.0.0.1:5183/";
await mkdir("work", { recursive: true });
for (const [label, width, height] of [
  ["desktop", 1440, 1050],
  ["mobile", 390, 844],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    reducedMotion: label === "mobile" ? "reduce" : "no-preference",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(1200);
  await page
    .getByRole("button", { name: "Deploy to Render", exact: true })
    .click();
  const deploy = page.getByRole("group", { name: "Deployment language" });
  assert.equal(await deploy.getByRole("link").count(), 2);
  for (const lang of ["TypeScript", "Python"]) {
    const link = deploy.getByRole("link", { name: lang });
    assert.equal(await link.getAttribute("target"), "_blank");
    assert.ok((await link.getAttribute("href")).includes("ojus_demos"));
  }
  await deploy.getByRole("link", { name: "Python" }).focus();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Deploy to Render", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await page.getByRole("textbox", { name: "Player name" }).fill("Tester");
  await page.screenshot({
    path: `work/ui-${label}-initial.png`,
    fullPage: true,
  });
  const workflowBox = await page
    .getByRole("region", { name: "Match workflow" })
    .boundingBox();
  const pitchBox = await page
    .getByRole("region", { name: "Penalty shootout", exact: true })
    .boundingBox();
  assert.ok(workflowBox.y < pitchBox.y, "Workflow is visible above the pitch");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page
    .getByRole("button", { name: "Shoot", exact: true })
    .waitFor({ timeout: 60000 });
  const commands = [];
  let abort = true;
  await page.route("**/api/play", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "shoot") {
      commands.push(body);
      if (abort) {
        abort = false;
        await route.abort();
        return;
      }
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Shoot", exact: true }).click();
  await page.getByRole("button", { name: "Retry", exact: true }).waitFor();
  await page.screenshot({ path: `work/ui-${label}-retry.png`, fullPage: true });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  for (let n = 1; n <= 5; n++) {
    const next = page.getByRole("button", {
      name: n === 5 ? "Try again" : "Next shot",
      exact: true,
    });
    await next.waitFor({ timeout: 60000 });
    await next.waitFor({ state: "visible" });
    await page.waitForFunction(
      (text) =>
        Array.from(document.querySelectorAll("button")).some(
          (b) => b.textContent.trim() === text && !b.disabled,
        ),
      n === 5 ? "Try again" : "Next shot",
      { timeout: 60000 },
    );
    if (n === 1) {
      assert.deepEqual(commands[0], commands[1]);
      await page.screenshot({
        path: `work/ui-${label}-result.png`,
        fullPage: true,
      });
    }
    if (n < 5) {
      await next.click();
      if (n === 1) {
        const stage = page.getByRole("group", { name: /Aim on the pitch/ });
        await stage.focus();
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("Space");
      } else if (n === 2) {
        const box = await page.locator("canvas").boundingBox();
        await page
          .locator("canvas")
          .click({ position: { x: box.width * 0.65, y: box.height * 0.35 } });
      } else
        await page.getByRole("button", { name: "Shoot", exact: true }).click();
    }
  }
  assert.equal(await page.locator(".match-steps .done").count(), 8);
  await page
    .getByText("Finish match", { exact: true })
    .waitFor({ timeout: 20000 });
  assert.equal(await page.locator(".execution-run").count(), 6);
  assert.equal(
    await page.getByText("Jev decision", { exact: true }).count(),
    5,
  );
  assert.ok(
    (await page.locator(".execution-panel").innerText()).includes("Jev’s move"),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  const runsBefore = await page.locator(".run-id").allTextContents();
  const scoreBefore = await page.locator(".career").innerText();
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll(".execution-run").length === 6,
    { timeout: 60000 },
  );
  await page
    .getByRole("button", { name: "Try again", exact: true })
    .waitFor({ timeout: 60000 });
  assert.deepEqual(await page.locator(".run-id").allTextContents(), runsBefore);
  assert.equal(await page.locator(".career").innerText(), scoreBefore);
  assert.equal(await page.locator(".match-steps .done").count(), 8);
  await page.screenshot({
    path: `work/ui-${label}-complete.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByRole("button", { name: "Shoot", exact: true })
    .waitFor({ timeout: 60000 });
  assert.equal(await page.locator(".score strong").innerText(), "0");
  assert.ok(
    (await page.locator(".player-label").innerText()).includes("Tester"),
  );
  assert.equal(await page.locator(".shot-markers .goal").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    label,
    "PASS: real five-shot game, retry, pointer, keyboard, trace, refresh recovery, replay, deploy menu, no overflow or JS errors.",
  );
  await page.close();
}
await browser.close();
