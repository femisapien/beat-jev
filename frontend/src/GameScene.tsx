import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import Footballer from "./Footballer";
import ShotInput from "./ShotInput";
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
};
function Net() {
  const geometry = useMemo(() => {
    const points: number[] = [];
    const line = (a: number[], b: number[]) => points.push(...a, ...b);
    for (let x = -3.66; x <= 3.67; x += 0.25) {
      line([x, 0, -7.2], [x, 2.44, -7.2]);
      line([x, 2.44, -6], [x, 2.44, -7.2]);
    }
    for (let y = 0; y <= 2.45; y += 0.2) {
      line([-3.66, y, -7.2], [3.66, y, -7.2]);
      for (const x of [-3.66, 3.66]) line([x, y, -6], [x, y, -7.2]);
    }
    for (let z = -7.2; z <= -5.99; z += 0.2) {
      line([-3.66, 2.44, z], [3.66, 2.44, z]);
      for (const x of [-3.66, 3.66]) line([x, 0, z], [x, 2.44, z]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, []);
  return (
    <group>
      <lineSegments geometry={geometry}>
        <lineBasicMaterial color="#c0d5cf" transparent opacity={0.43} />
      </lineSegments>
      {[-3.66, 3.66].map((x) => (
        <mesh key={x} position={[x, 1.22, -6]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 2.5, 12]} />
          <meshStandardMaterial color="#f1f4eb" />
        </mesh>
      ))}
      <mesh position={[0, 2.44, -6]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 7.43, 12]} />
        <meshStandardMaterial color="#f1f4eb" />
      </mesh>
    </group>
  );
}
function Pitch() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color="#244e40" roughness={1} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.008, -24 + i * 4]}
          receiveShadow
        >
          <planeGeometry args={[52, 2]} />
          <meshStandardMaterial color="#2a5645" roughness={1} />
        </mesh>
      ))}
      {[
        [0, -6, 24, 0.045],
        [-8.5, 0, 0.045, 12],
        [8.5, 0, 0.045, 12],
        [0, 6, 17, 0.045],
        [-5.5, -3, 0.045, 6],
        [5.5, -3, 0.045, 6],
        [0, 0, 11, 0.045],
      ].map(([x, z, w, h], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.018, z]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial color="#91afa0" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 4.5]}>
        <circleGeometry args={[0.1, 20]} />
        <meshBasicMaterial color="#d7e1c8" />
      </mesh>
      <Net />
      {Array.from({ length: 5 }, (_, row) => (
        <group key={row}>
          <mesh position={[0, 0.35 + row * 0.5, -10 - row * 0.8]} receiveShadow>
            <boxGeometry args={[40, 0.7, 0.75]} />
            <meshStandardMaterial color={row % 2 ? "#1d302d" : "#293c39"} />
          </mesh>
          {Array.from({ length: 35 }, (_, i) => (
            <mesh
              key={i}
              position={[-17 + i, 0.85 + row * 0.5, -10 - row * 0.8]}
            >
              <boxGeometry args={[0.48, 0.15, 0.4]} />
              <meshStandardMaterial
                color={
                  ["#64756d", "#a4ba91", "#79609d", "#4b7661"][
                    (i * 7 + row) % 4
                  ]
                }
              />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 0.52, -8.7]}>
        <boxGeometry args={[25, 0.75, 0.16]} />
        <meshStandardMaterial color="#233431" />
      </mesh>
      {[-12, 12].map((x) => (
        <group key={x}>
          <mesh position={[x, 5, -8]}>
            <cylinderGeometry args={[0.07, 0.1, 10, 8]} />
            <meshStandardMaterial color="#637972" />
          </mesh>
          <mesh position={[x, 10, -8]}>
            <boxGeometry args={[1.7, 0.55, 0.25]} />
            <meshStandardMaterial
              color="#fcf6da"
              emissive="#fff8ce"
              emissiveIntensity={2}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
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
      <mesh castShadow>
        <sphereGeometry args={[0.14, 24, 16]} />
        <meshStandardMaterial color="#f9f7ec" roughness={0.5} />
      </mesh>
      {[
        [0, 0, 0.136],
        [0, 0, -0.136],
        [0.136, 0, 0],
        [-0.136, 0, 0],
        [0, 0.136, 0],
        [0, -0.136, 0],
      ].map((p, i) => (
        <mesh
          key={i}
          position={p as [number, number, number]}
          rotation={[
            i >= 4 ? Math.PI / 2 : 0,
            i === 2 ? Math.PI / 2 : i === 3 ? -Math.PI / 2 : 0,
            0,
          ]}
        >
          <circleGeometry args={[0.061, 5]} />
          <meshStandardMaterial color="#182620" side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
function Scene(props: Props) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(0, 4.5, 17);
    cam.lookAt(0, 0.65, 0.5);
    cam.fov = Math.max(
      24,
      THREE.MathUtils.radToDeg(
        2 * Math.atan(6.3 / (23 * (size.width / size.height))),
      ),
    );
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return (
    <>
      <color attach="background" args={["#172c28"]} />
      <fog attach="fog" args={["#172c28", 22, 65]} />
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#cfdfed", "#2e4937", 1.6]} />
      <directionalLight
        castShadow
        position={[-5, 12, 5]}
        intensity={2.7}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-normalBias={0.025}
      />
      <directionalLight position={[6, 6, -9]} color="#c1b2fd" intensity={1.4} />
      <Pitch />
      <Footballer flight={props.flight} reducedMotion={props.reducedMotion} />
      <Footballer
        keeper
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
