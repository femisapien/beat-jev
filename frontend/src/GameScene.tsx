import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { frameCamera } from "./camera";
import Footballer from "./Footballer";
import ShotInput from "./ShotInput";
import Stadium from "./Stadium";
import Football from "./Football";
import { type Playback } from "./playback";
import { ballAt, flightMs, impactTime, endTime } from "../../shared/flight";
import config from "../../shared/game.json";
import type { Aim, Kick } from "../../shared/types";

type Props = {
  aim: Aim;
  onAim: (aim: Aim) => void;
  onShoot: (aim: Aim, kick?: Kick) => void;
  ready: boolean;
  flight: Playback | null;
  onComplete: () => void;
  reducedMotion: boolean;
  defending: boolean;
  humanKeeper: Aim;
  keeperStance: number;
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
  useLayoutEffect(() => {
    done.current = false;
  }, [flight?.startedAt]);
  useFrame(() => {
    if (!ref.current) return;
    if (!flight) {
      ref.current.position.set(0, 0.14, 4.5);
      ref.current.rotation.set(0, 0, 0);
      return;
    }
    const elapsed = performance.now() - flight.startedAt;
    const t = reducedMotion
      ? 1
      : THREE.MathUtils.clamp(
          (elapsed - config.runupMs) / flightMs(flight.kick),
          0,
          1,
        );
    const position = ballAt(flight.aim, flight.kick, t);
    const bounce =
      flight.reaction?.outcome === "saved" && t === 1
        ? THREE.MathUtils.clamp((elapsed - impactTime(flight.kick)) / 300, 0, 1)
        : 0;
    ref.current.position.set(
      position.x,
      Math.max(0.14, position.y) * (1 - bounce * 0.6),
      position.z + bounce * 1.3,
    );
    ref.current.rotation.set(-t * 12, 0, t * 5);
    if ((elapsed >= endTime(flight.kick) || reducedMotion) && !done.current) {
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
  useFrame(() => {
    const elapsed = props.flight
      ? performance.now() - props.flight.startedAt
      : 0;
    const progress =
      props.flight && !props.reducedMotion
        ? THREE.MathUtils.smoothstep(elapsed, 0, config.runupMs + 500)
        : 0;
    const follow = props.flight ? props.flight.aim.x * progress : 0;
    frameCamera(
      camera as THREE.PerspectiveCamera,
      size.width / size.height,
      progress,
      follow,
    );
  });
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
        stance={props.keeperStance}
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
