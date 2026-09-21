import * as THREE from "three";

// Keep the full goal and the run-up in frame, including narrow touch screens.
export function frameCamera(
  camera: THREE.PerspectiveCamera,
  aspect: number,
  push = 0,
  follow = 0,
) {
  camera.aspect = aspect;
  camera.fov = Math.max(
    32,
    THREE.MathUtils.radToDeg(2 * Math.atan(5.8 / (21 * aspect))),
  );
  camera.position.set(follow * 0.1, 3.2 - push * 0.15, 15 - push * 2.2);
  camera.lookAt(follow * 0.3, 1.05 + push * 0.15, -2 - push);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
