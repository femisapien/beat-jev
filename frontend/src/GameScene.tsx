import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Aim, Shot } from "../../shared/types";

type Props = {
  aim: Aim;
  onAim: (aim: Aim) => void;
  onShoot: (aim: Aim) => void;
  ready: boolean;
  shot: Shot | null;
  onComplete: () => void;
  reducedMotion: boolean;
};
function Capsule({
  position = [0, 0, 0],
  radius = 0.1,
  length = 0.4,
  color,
  ...rest
}: any) {
  return (
    <mesh position={position} castShadow {...rest}>
      <capsuleGeometry args={[radius, length, 4, 10]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}
function Boot({ x = 0 }: { x?: number }) {
  return (
    <mesh position={[x, -0.43, -0.1]} castShadow>
      <boxGeometry args={[0.17, 0.12, 0.32]} />
      <meshStandardMaterial color="#15201e" />
    </mesh>
  );
}
function Footballer({
  keeper = false,
  shot,
  reducedMotion,
}: {
  keeper?: boolean;
  shot: Shot | null;
  reducedMotion: boolean;
}) {
  const body = useRef<THREE.Group>(null),
    leftArm = useRef<THREE.Group>(null),
    rightArm = useRef<THREE.Group>(null),
    leftLeg = useRef<THREE.Group>(null),
    rightLeg = useRef<THREE.Group>(null);
  const start = useRef(0);
  useEffect(() => {
    start.current = performance.now();
  }, [shot]);
  useFrame(({ clock }) => {
    if (!body.current) return;
    const t = shot
      ? Math.min(1, (performance.now() - start.current) / 1100)
      : 0;
    const dive =
      keeper && shot && shot.outcome !== "wide"
        ? Math.min(1, Math.max(0, (t - 0.14) / 0.6))
        : 0;
    const x = shot?.keeper?.x || 0,
      y = shot?.keeper?.y || 0.4;
    body.current.position.set(
      keeper ? x * 3.66 * dive : -0.68,
      keeper
        ? 0.03 + Math.sin(dive * Math.PI) * 0.4 + Math.max(0, y - 0.4) * dive
        : 0,
      keeper ? -5.72 : 5.35 - Math.sin(Math.min(1, t * 2) * Math.PI) * 0.5,
    );
    body.current.rotation.z = keeper ? -Math.sign(x) * dive * 1.07 : 0;
    body.current.rotation.y = keeper ? 0 : Math.PI;
    if (!shot && !reducedMotion)
      body.current.position.y = Math.sin(clock.elapsedTime * 2) * 0.018;
    if (leftArm.current)
      leftArm.current.rotation.z = keeper ? 0.35 + dive * 0.65 : 0.12;
    if (rightArm.current)
      rightArm.current.rotation.z = keeper ? -0.35 - dive * 0.65 : -0.12;
    if (leftLeg.current) leftLeg.current.rotation.x = keeper ? -0.1 : 0;
    if (rightLeg.current)
      rightLeg.current.rotation.x = keeper
        ? -0.1
        : shot
          ? Math.sin(Math.min(1, t * 3.5) * Math.PI) * -1.1
          : 0;
  });
  const kit = keeper ? "#965dff" : "#f1eee4",
    shorts = keeper ? "#50268a" : "#213b37",
    skin = keeper ? "#be8b66" : "#bd8663";
  return (
    <group ref={body}>
      <Capsule
        position={[0, 1.08, 0]}
        radius={0.23}
        length={0.36}
        color={kit}
        scale={[1, 0.95, 0.73]}
      />
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry args={[0.43, 0.24, 0.29]} />
        <meshStandardMaterial color={shorts} />
      </mesh>
      <Capsule
        position={[0, 1.45, 0]}
        radius={0.085}
        length={0.1}
        color={skin}
      />
      <mesh position={[0, 1.66, 0]} castShadow>
        <sphereGeometry args={[0.185, 16, 12]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      <mesh position={[0, 1.75, -0.01]} castShadow>
        <sphereGeometry
          args={[0.188, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48]}
        />
        <meshStandardMaterial color="#242521" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.065, 1.68, 0.169]}>
          <sphereGeometry args={[0.014, 8, 8]} />
          <meshBasicMaterial color="#17231f" />
        </mesh>
      ))}
      <group position={[-0.27, 1.29, 0]} ref={leftArm}>
        <Capsule
          position={[0, -0.16, 0]}
          radius={0.085}
          length={0.23}
          color={kit}
        />
        <Capsule
          position={[0, -0.41, 0.04]}
          radius={0.065}
          length={0.2}
          color={skin}
        />
        <Capsule
          position={[0, -0.58, 0.08]}
          radius={0.08}
          length={0.04}
          color={keeper ? "#daf5a4" : skin}
        />
      </group>
      <group position={[0.27, 1.29, 0]} ref={rightArm}>
        <Capsule
          position={[0, -0.16, 0]}
          radius={0.085}
          length={0.23}
          color={kit}
        />
        <Capsule
          position={[0, -0.41, 0.04]}
          radius={0.065}
          length={0.2}
          color={skin}
        />
        <Capsule
          position={[0, -0.58, 0.08]}
          radius={0.08}
          length={0.04}
          color={keeper ? "#daf5a4" : skin}
        />
      </group>
      {[-1, 1].map((s, i) => (
        <group
          key={s}
          position={[s * 0.13, 0.68, 0]}
          ref={i === 0 ? leftLeg : rightLeg}
        >
          <Capsule
            position={[0, -0.14, 0]}
            radius={0.1}
            length={0.19}
            color={skin}
          />
          <Capsule
            position={[0, -0.35, 0]}
            radius={0.075}
            length={0.22}
            color={kit}
          />
          <Boot />
        </group>
      ))}
      <mesh position={[0, 1.13, 0.178]}>
        <planeGeometry args={[0.09, 0.17]} />
        <meshBasicMaterial color={keeper ? "#eee2ff" : "#203833"} />
      </mesh>
    </group>
  );
}
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
  shot,
  onComplete,
  reducedMotion,
}: {
  shot: Shot | null;
  onComplete: () => void;
  reducedMotion: boolean;
}) {
  const ref = useRef<THREE.Group>(null),
    start = useRef(0),
    done = useRef(false);
  useEffect(() => {
    start.current = performance.now();
    done.current = false;
  }, [shot]);
  useFrame(() => {
    if (!ref.current) return;
    if (!shot) {
      ref.current.position.set(0, 0.14, 4.5);
      ref.current.rotation.set(0, 0, 0);
      return;
    }
    const elapsed = performance.now() - start.current;
    const t = reducedMotion
      ? 1
      : Math.min(1, Math.max(0, (elapsed - 180) / 720));
    const a = shot.aim!;
    const bounce = shot.outcome === "saved" && t > 0.82 ? (t - 0.82) / 0.18 : 0;
    ref.current.position.set(
      a.x * 3.66 * t,
      0.14 + (a.y * 2.44 - 0.14) * t + Math.sin(t * Math.PI) * 0.65,
      4.5 - 10.8 * t + bounce * 1.8,
    );
    ref.current.rotation.x = -t * 12;
    ref.current.rotation.z = t * 5;
    if (t === 1 && !done.current) {
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
  const aim = (e: ThreeEvent<PointerEvent>) => ({
    x:
      Math.round(THREE.MathUtils.clamp(e.point.x / 3.66, -1.6, 1.6) * 1000) /
      1000,
    y:
      Math.round(THREE.MathUtils.clamp(e.point.y / 2.44, -0.4, 1.5) * 1000) /
      1000,
  });
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
      <Footballer shot={props.shot} reducedMotion={props.reducedMotion} />
      <Footballer
        keeper
        shot={props.shot}
        reducedMotion={props.reducedMotion}
      />
      <Ball
        shot={props.shot}
        reducedMotion={props.reducedMotion}
        onComplete={props.onComplete}
      />
      {props.ready && (
        <group position={[props.aim.x * 3.66, props.aim.y * 2.44, -5.86]}>
          <mesh>
            <ringGeometry args={[0.12, 0.14, 32]} />
            <meshBasicMaterial color="#ddff9a" side={THREE.DoubleSide} />
          </mesh>
          <mesh>
            <circleGeometry args={[0.025, 16]} />
            <meshBasicMaterial color="#ddff9a" />
          </mesh>
        </group>
      )}
      <mesh
        position={[0, 1.2, -5.8]}
        onPointerMove={(e) => {
          if (props.ready) props.onAim(aim(e));
        }}
        onPointerDown={(e) => {
          if (props.ready) {
            e.stopPropagation();
            props.onAim(aim(e));
          }
        }}
        onPointerUp={(e) => {
          if (props.ready) {
            e.stopPropagation();
            props.onShoot(aim(e));
          }
        }}
      >
        <planeGeometry args={[13, 7]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
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
