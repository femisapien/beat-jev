import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { frameCamera } from "../frontend/src/camera";
import { groundAim, missLabel } from "../frontend/src/playback";
import { projectPointer } from "../frontend/src/ShotInput";
import { resolveShot } from "../typescript/src/game";
test("reported center miss maps to a grounded shot", () => {
  const aim = groundAim({ x: 0.006, y: -0.017 });
  assert.equal(aim.y, 0.06);
  assert.equal(resolveShot(aim, "center_low").outcome, "saved");
  assert.equal(missLabel({ x: 0, y: 1.2 }), "OVER");
  assert.equal(missLabel({ x: 1.2, y: 0.5 }), "WIDE");
});
test("canvas-relative projection preserves goal coordinates at desktop and mobile widths", () => {
  for (const [width, height] of [
    [856, 446],
    [360, 390],
  ]) {
    const rect = { left: 132, top: 359, width, height };
    const cam = new THREE.PerspectiveCamera();
    frameCamera(cam, width / height);
    for (const p of [
      new THREE.Vector3(0, 1.22, -6),
      new THREE.Vector3(-3.2, 0.2, -6),
      new THREE.Vector3(3.2, 2.2, -6),
    ]) {
      const screen = p.clone().project(cam);
      const actual = projectPointer(
        {
          x: rect.left + ((screen.x + 1) * width) / 2,
          y: rect.top + ((1 - screen.y) * height) / 2,
        },
        rect,
        cam,
      );
      assert.ok(actual.distanceTo(p) < 0.00001);
    }
  }
});
