import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import Footballer from "./Footballer";
import ShotInput from "./ShotInput";
import Stadium from "./Stadium";
import Football from "./Football";
import { impactMs, endMs, type Playback } from "./playback";
import config from "../../shared/game.json";
import type { Aim } from "../../shared/types";

type Props = {
  aim: Aim;
  onAim: (aim: Aim) => void;
  onShoot: (aim: Aim, path?: Aim[]) => void;
  ready: boolean;
  flight: Playback | null;
  onComplete: () => void;
  reducedMotion: boolean;
  defending: boolean;
  humanKeeper: Aim;
};
function Ball({
  flight,
  onComplete,
  reducedMotion,
}: {
  flight: Playback | null;
  onComplete: () => void;
  reducedMotion: boolean;
}) {
  const ref = useRef<THREE.Group>(null),
    done = useRef(false);
  const curve = useMemo(
    () =>
      flight
        ? new THREE.CatmullRomCurve3(
            flight.path.map(
              (p, i) =>
                new THREE.Vector3(
                  p.x * 3.66,
                  p.y * 2.44,
                  4.5 - (10.5 * i) / (flight.path.length - 1),
                ),
            ),
            false,
            "centripetal",
          )
        : null,
    [flight?.startedAt],
  );
  useLayoutEffect(() => {
    done.current = false;
  }, [flight?.startedAt]);
  useFrame(() => {
    if (!ref.current) return;
    if (!flight || !curve) {
      ref.current.position.set(0, 0.14, 4.5);
      ref.current.rotation.set(0, 0, 0);
      return;
    }
    const elapsed = performance.now() - flight.startedAt;
    const t = reducedMotion
      ? 1
      : THREE.MathUtils.clamp(
          (elapsed - config.runupMs) / config.flightMs,
          0,
          1,
        );
    const position = curve.getPoint(t);
    const bounce =
      flight.reaction?.outcome === "saved" && t === 1
        ? THREE.MathUtils.clamp((elapsed - impactMs) / 300, 0, 1)
        : 0;
    ref.current.position.set(
      position.x,
      Math.max(0.14, position.y) * (1 - bounce * 0.6),
      position.z + bounce * 1.3,
    );
    ref.current.rotation.set(-t * 12, 0, t * 5);
    if ((elapsed >= endMs || reducedMotion) && !done.current) {
      done.current = true;
      onComplete();
    }
  });
  return (
    <group ref={ref}>
      <Football />
    </group>
  );
}
function Scene(props: Props) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(0, 3.2, 12.5);
    cam.lookAt(0, 1.25, -2);
    cam.fov = Math.max(
      32,
      THREE.MathUtils.radToDeg(
        2 * Math.atan(5.8 / (18.5 * (size.width / size.height))),
      ),
    );
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return (
    <>
      <Stadium />
      <Footballer
        human={!props.defending}
        flight={props.flight}
        reducedMotion={props.reducedMotion}
      />
      <Footballer
        keeper
        human={props.defending}
        control={props.defending ? props.humanKeeper : undefined}
        flight={props.flight}
        reducedMotion={props.reducedMotion}
      />
      <Ball
        flight={props.flight}
        reducedMotion={props.reducedMotion}
        onComplete={props.onComplete}
      />
      <ShotInput
        ready={props.ready}
        aim={props.aim}
        onAim={props.onAim}
        onShoot={props.onShoot}
      />
    </>
  );
}
export default function GameScene(props: Props) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.7]}
      camera={{ position: [0, 3.3, 10.5], near: 0.1, far: 100 }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
