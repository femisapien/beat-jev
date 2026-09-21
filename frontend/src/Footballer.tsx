import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import * as THREE from "three";
import config from "../../shared/game.json";
import { impactTime } from "../../shared/flight";
import type { Aim } from "../../shared/types";
import { keeperMotion, type Playback } from "./playback";

// Each athlete owns a skeleton and fitted kit; the geometry is shared.
export default function Footballer({
  keeper = false,
  human = !keeper,
  control,
  stance = 0,
  flight,
  reducedMotion,
}: {
  keeper?: boolean;
  human?: boolean;
  control?: Aim;
  stance?: number;
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
  const position = useRef(0);
  useFrame(({ clock }, dt) => {
    if (!actor.current) return;
    const root = actor.current;
    const now = performance.now();
    const elapsed = flight
      ? reducedMotion
        ? impactTime(flight.kick)
        : Math.max(0, now - flight.startedAt)
      : 0;
    const clamp = THREE.MathUtils.clamp;
    const lerp = THREE.MathUtils.lerp;
    const smooth = (x: number) => {
      const t = clamp(x, 0, 1);
      return t * t * (3 - 2 * t);
    };
    const idle = reducedMotion ? 0 : clock.elapsedTime;
    const motion = control ? null : keeperMotion(flight, now, reducedMotion);
    for (const [bone, q] of rig.rest) bone.quaternion.copy(q);
    root.position.set(0, 0.02, keeper ? -5.78 : 6.8);
    root.rotation.set(0, keeper ? 0 : Math.PI, 0);
    rig.object.updateMatrixWorld(true);

    if (!keeper) {
      const approach = flight
        ? clamp(elapsed / (config.runupMs * 0.78), 0, 1)
        : 0;
      const plant = flight
        ? smooth((elapsed / config.runupMs - 0.7) / 0.12)
        : 0;
      const swing = flight
        ? smooth((elapsed / config.runupMs - 0.85) / 0.15)
        : 0;
      const follow = flight ? smooth((elapsed - config.runupMs) / 500) : 0;
      const stride = Math.sin(approach * Math.PI * 3) * (1 - plant);
      const rightLeg =
        stride * 0.52 + plant * lerp(0.65, -0.63, swing) * (1 - follow);
      const leftLeg = -stride * 0.52 - plant * 0.12 + follow * 0.1;
      const heading = flight ? Math.atan2(flight.aim.x * 3.66, 10.5) : 0;
      root.position.set(
        lerp(-0.82, -0.19, approach),
        0.02,
        lerp(6.8, 5.05, approach) - follow * 0.35,
      );
      root.rotation.y = Math.PI - lerp(0.32, heading * 0.7, approach);
      rotate("thigh_l", leftLeg);
      rotate("thigh_r", rightLeg);
      rotate("calf_l", Math.max(0, stride) * 0.95 + plant * 0.08);
      rotate("calf_r", Math.max(0, -stride) * 0.95 + plant * (1 - swing) * 0.9);
      rotate("foot_r", -swing * (1 - follow) * 0.18);
      rotate(
        "upperarm_l",
        stride * 0.38 - plant * 0.18,
        0,
        -0.46 + plant * 0.18,
      );
      rotate("upperarm_r", -stride * 0.38, 0, 0.46 - plant * 0.1);
      rotate(
        "lowerarm_l",
        (flight ? 0.25 + follow * 0.35 : 0.6) - plant * 0.25,
      );
      rotate("lowerarm_r", flight ? 0.25 + follow * 0.35 : 0.6);
      rotate("spine_01", -0.04 - approach * 0.13 + follow * 0.12, -swing * 0.1);
      rotate("head", 0.08, heading * 0.2);
      root.position.y += flight
        ? Math.abs(stride) * 0.055
        : Math.sin(idle * 2.4) * 0.008;
    } else {
      const previousX = position.current;
      const desiredX = control ? control.x * 3.66 : stance * 3.66;
      position.current = reducedMotion
        ? desiredX
        : THREE.MathUtils.damp(position.current, desiredX, 7, dt);
      const moving = Math.min(
        1,
        Math.abs(position.current - previousX) / Math.max(dt, 0.001),
      );
      const shuffle = reducedMotion ? 0 : Math.sin(idle * 5.2);
      const settle = flight ? 1 - smooth(elapsed / config.runupMs) : 1;
      const step = shuffle * (0.14 * settle + moving * 0.12);
      const landing = flight
        ? smooth((elapsed - impactTime(flight.kick)) / 450)
        : 0;
      const recover = flight
        ? smooth((elapsed - impactTime(flight.kick) - 500) / 600)
        : 0;
      const dive = (motion?.progress || 0) * (1 - recover);
      const target = motion?.target;
      const direction = Math.sign((target?.x || 0) * 3.66 - desiredX);
      const low = !!target && target.y < 0.4;
      const jump = control ? smooth((control.y - 0.25) / 0.51) : 0;
      const split =
        flight && elapsed < config.runupMs + 140
          ? Math.sin(
              clamp((elapsed - config.runupMs + 150) / 290, 0, 1) * Math.PI,
            ) * 0.05
          : 0;
      root.position.x = position.current + step * settle;
      root.position.y = -0.055 + Math.abs(step) * 0.3 + split + jump * 0.38;
      rotate("thigh_l", -0.48 + step * 1.8, 0, 0.23 - dive * 0.1);
      rotate("thigh_r", -0.48 - step * 1.8, 0, -0.23 + dive * 0.1);
      rotate("calf_l", 0.82 + step * 1.2 - dive * 0.55);
      rotate("calf_r", 0.82 - step * 1.2 - dive * 0.35);
      rotate("spine_01", -0.16 + dive * 0.12);
      rotate("head", 0.12);
      const reach = Math.max(jump, dive);
      rotate(
        "upperarm_l",
        -0.18 - (low ? dive * 0.3 : 0),
        0,
        -0.42 + reach * 2.1,
      );
      rotate(
        "upperarm_r",
        -0.18 - (low ? dive * 0.3 : 0),
        0,
        0.42 - reach * 2.1,
      );
      rotate("lowerarm_l", 0.1 * (1 - reach) + dive * 0.18);
      rotate("lowerarm_r", 0.1 * (1 - reach) + dive * 0.18);
      if (motion && target) {
        root.rotation.z =
          -direction * dive * (low ? 1.42 : 1.14 + landing * 0.28);
        if (!direction) root.rotation.x = (low ? 0.65 : 0) * dive;
        root.updateMatrixWorld(true);
        rig.object.getObjectByName("hand_l")!.getWorldPosition(temp.l);
        rig.object.getObjectByName("hand_r")!.getWorldPosition(temp.r);
        temp.p.copy(temp.l).add(temp.r).multiplyScalar(0.5);
        const targetY = lerp(target.y * 2.44, 0.25, landing);
        root.position.x += (target.x * 3.66 - temp.p.x) * dive;
        root.position.y = Math.max(
          0.02,
          root.position.y + (targetY - temp.p.y) * dive,
        );
      }
    }
    // Ground the support foot through the approach and keeper's ready stance.
    if ((!keeper || !motion) && !(control && control.y > 0.5)) {
      root.updateMatrixWorld(true);
      rig.object.getObjectByName("foot_l")!.getWorldPosition(temp.l);
      rig.object.getObjectByName("foot_r")!.getWorldPosition(temp.r);
      root.position.y += 0.095 - Math.min(temp.l.y, temp.r.y);
    }
  });
  return (
    <group ref={actor}>
      <primitive object={rig.object} />
    </group>
  );
}
