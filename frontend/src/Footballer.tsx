import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import * as THREE from "three";
import config from "../../shared/game.json";
import type { Aim } from "../../shared/types";
import { keeperMotion, type Playback } from "./playback";

// Each athlete owns a skeleton and fitted kit; the geometry is shared.
export default function Footballer({
  keeper = false,
  human = !keeper,
  control,
  flight,
  reducedMotion,
}: {
  keeper?: boolean;
  human?: boolean;
  control?: Aim;
  flight: Playback | null;
  reducedMotion: boolean;
}) {
  const asset = useLoader(GLTFLoader, "/models/athlete.glb");
  const rig = useMemo(() => {
    const object = clone(asset.scene);

    const rest = new Map<THREE.Bone, THREE.Quaternion>();
    const ownedMaterials: THREE.Material[] = [];
    object.traverse((node) => {
      if (node instanceof THREE.Bone) rest.set(node, node.quaternion.clone());
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = false;
      node.frustumCulled = false;
      if (node.name === "Gloves") node.visible = keeper;
      const original = Array.isArray(node.material)
        ? node.material
        : [node.material];
      const materials = original.map((m) => {
        const material = m.clone() as THREE.MeshStandardMaterial;
        const colors: Record<string, string> = {
          jersey: human ? "#faf7e8" : "#7435cd",
          shorts: human ? "#182822" : "#291446",
          socks: human ? "#faf7e8" : "#6931b0",
          boots: "#191d20",
          gloves: "#e5f0b0",
          trim: human ? "#263b31" : "#c6a4f0",
        };
        if (colors[m.name]) material.color.set(colors[m.name]);
        if (["skin", "hair", "brows", "eyes"].includes(m.name)) {
          const cutout = /hair|brows/.test(m.name);
          material.transparent = false;
          material.alphaTest = cutout ? 0.45 : 0;
          material.side = THREE.DoubleSide;
          material.roughness = cutout ? 0.85 : 0.62;
        }
        ownedMaterials.push(material);
        return material;
      });
      node.material = Array.isArray(node.material) ? materials : materials[0];
    });
    // The shirt number follows the upper back bone through the kick.
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 160;
    const context = canvas.getContext("2d")!;
    context.fillStyle = human ? "#1b3329" : "#eee6fc";
    context.font = "bold 138px Arial";
    context.textAlign = "center";
    context.fillText(human ? "7" : "1", 64, 137);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const number = new THREE.Mesh(
      new THREE.PlaneGeometry(0.21, 0.26),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    number.position.set(0, 1.38, -0.116);
    number.rotation.y = Math.PI;
    object.add(number);
    object.updateMatrixWorld(true);
    object.getObjectByName("spine_03")?.attach(number);
    object.scale.setScalar(1.02);
    return { object, rest, ownedMaterials, number, texture };
  }, [asset, keeper, human]);
  useEffect(
    () => () => {
      rig.ownedMaterials.forEach((material) => material.dispose());
      rig.number.geometry.dispose();
      rig.number.material.dispose();
      rig.texture.dispose();
    },
    [rig],
  );
  const actor = useRef<THREE.Group>(null);
  const temp = useMemo(
    () => ({
      q: new THREE.Quaternion(),
      world: new THREE.Quaternion(),
      delta: new THREE.Quaternion(),
      axis: new THREE.Vector3(),
      p: new THREE.Vector3(),
      l: new THREE.Vector3(),
      r: new THREE.Vector3(),
    }),
    [],
  );
  function rotate(name: string, x = 0, y = 0, z = 0) {
    const bone = rig.object.getObjectByName(name);
    if (!bone?.parent) return;
    // Apply rotations in character space, independent of the bone's bind axes.
    rig.object.getWorldQuaternion(temp.world).invert();
    bone.parent.getWorldQuaternion(temp.q).premultiply(temp.world);
    temp.delta.setFromEuler(new THREE.Euler(x, y, z));
    temp.delta.premultiply(temp.q.clone().invert()).multiply(temp.q);
    bone.quaternion.premultiply(temp.delta);
    bone.updateMatrixWorld(true);
  }
  useFrame(({ clock }) => {
    if (!actor.current) return;
    const now = performance.now();
    const motion = keeperMotion(flight, now, reducedMotion);
    const target = control || motion?.target;
    const dive = keeper ? (control ? 1 : motion?.progress || 0) : 0;
    const low = !!target && target.y < 0.4;
    const direction = control ? 0 : Math.sign(target?.x || 0);
    const armReach = control ? (control.y > 0.5 ? 1 : 0) : dive;
    const elapsed = flight
      ? reducedMotion
        ? 1000
        : now - flight.startedAt
      : 0;
    const windup = Math.min(1, elapsed / config.runupMs);
    const follow = Math.min(1, Math.max(0, elapsed - config.runupMs) / 650);
    const leg = !flight
      ? 0
      : elapsed <= config.runupMs
        ? windup < 0.42
          ? (windup / 0.42) * 0.35
          : THREE.MathUtils.lerp(0.35, -0.62, (windup - 0.42) / 0.58)
        : follow < 0.2
          ? THREE.MathUtils.lerp(-0.62, -1.05, follow / 0.2)
          : THREE.MathUtils.lerp(-1.05, 0, (follow - 0.2) / 0.8);
    const kick = Math.abs(leg);
    actor.current.position.set(keeper ? 0 : -0.2, 0.02, keeper ? -5.78 : 5.17);
    actor.current.rotation.set(0, keeper ? 0 : Math.PI, 0);
    for (const [bone, q] of rig.rest) bone.quaternion.copy(q);
    rig.object.updateMatrixWorld(true);
    rotate(
      "upperarm_l",
      keeper ? -0.18 - (low ? dive * 0.6 : 0) : 0,
      0,
      keeper ? -0.12 + armReach * (low && !direction ? 0.3 : 2.25) : -0.52,
    );
    rotate(
      "upperarm_r",
      keeper ? -0.18 - (low ? dive * 0.6 : 0) : 0,
      0,
      keeper ? 0.12 - armReach * (low && !direction ? 0.3 : 2.25) : 0.52,
    );
    rotate("lowerarm_l", keeper ? dive * 0.7 : 0.72, 0, 0);
    rotate("lowerarm_r", keeper ? dive * 0.7 : 0.72, 0, 0);
    rotate("thigh_l", keeper ? -0.24 : 0, 0, keeper ? -0.12 : 0);
    rotate("thigh_r", keeper ? -0.24 : leg, 0, keeper ? 0.12 : 0);
    rotate("calf_l", keeper ? 0.38 : 0);
    rotate(
      "calf_r",
      keeper ? 0.38 : flight ? Math.max(0, 0.7 * (1 - windup)) : 0,
    );
    rotate("spine_01", keeper ? -0.08 : -0.1 - kick * 0.1);
    rotate("head", keeper ? 0 : 0.08);
    if (keeper) {
      actor.current.position.y = 0.02;
      actor.current.rotation.z = -direction * dive * (low ? 1.45 : 1.02);
      if (!direction)
        actor.current.rotation.x = (low ? (control ? 0.45 : 0.85) : 0) * dive;
      actor.current.updateMatrixWorld(true);
      if (dive > 0 && target) {
        const left = rig.object.getObjectByName("hand_l")!,
          right = rig.object.getObjectByName("hand_r")!;
        left.getWorldPosition(temp.l);
        right.getWorldPosition(temp.r);
        temp.p.copy(temp.l).add(temp.r).multiplyScalar(0.5);
        actor.current.position.x += (target.x * 3.66 - temp.p.x) * dive;
        actor.current.position.y = Math.max(
          control && control.y > 0.5 ? 0.24 : 0.02,
          actor.current.position.y + (target.y * 2.44 - temp.p.y) * dive,
        );
      }
    } else {
      actor.current.position.z -= flight
        ? Math.sin(Math.min(1, elapsed / 850) * Math.PI) * 0.1
        : 0;
    }
    if (!flight && !reducedMotion)
      actor.current.position.y += Math.sin(clock.elapsedTime * 2) * 0.008;
  });
  return (
    <group ref={actor}>
      <primitive object={rig.object} />
    </group>
  );
}
