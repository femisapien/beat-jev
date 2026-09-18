import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import * as THREE from "three";
import type { Shot } from "../../shared/types";

// One CC0 human rig, shared by both actors. Each actor owns its skeleton and kit.
export default function Footballer({
  keeper = false,
  shot,
  reducedMotion,
}: {
  keeper?: boolean;
  shot: Shot | null;
  reducedMotion: boolean;
}) {
  const asset = useLoader(GLTFLoader, "/models/footballer.glb");
  const rig = useMemo(() => {
    const object = clone(asset.scene);
    let skin: THREE.MeshStandardMaterial | undefined;
    object.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        const materials = Array.isArray(node.material)
          ? node.material
          : [node.material];
        skin ||= materials.find((m) => m.name === "MI_Superhero_Male") as
          THREE.MeshStandardMaterial | undefined;
      }
    });
    const kit = skin!.clone();
    kit.onBeforeCompile = (shader) => {
      shader.uniforms.jersey = {
        value: new THREE.Color(keeper ? "#9759e4" : "#f4f2e7"),
      };
      shader.uniforms.shorts = {
        value: new THREE.Color(keeper ? "#512784" : "#213c35"),
      };
      shader.uniforms.socks = {
        value: new THREE.Color(keeper ? "#713abb" : "#eeeedd"),
      };
      shader.uniforms.isKeeper = { value: keeper ? 1 : 0 };
      shader.vertexShader =
        "varying vec3 restPosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nrestPosition = position;",
      );
      shader.fragmentShader =
        "varying vec3 restPosition;\nuniform vec3 jersey; uniform vec3 shorts; uniform vec3 socks; uniform float isKeeper;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float h=restPosition.y; float side=abs(restPosition.x);
        if(h<0.105) diffuseColor.rgb=vec3(0.02,0.035,0.025);
        else if(h<0.45) diffuseColor.rgb=socks;
        else if(h>0.67 && h<1.02) diffuseColor.rgb=shorts;
        else if(h>=1.02 && h<1.535 && side<0.48) diffuseColor.rgb=jersey;
        else if(isKeeper>0.5 && side>0.765) diffuseColor.rgb=vec3(0.68,0.9,0.37);
      `,
      );
    };
    const rest = new Map<THREE.Bone, THREE.Quaternion>();
    object.traverse((node) => {
      if (node instanceof THREE.Bone) rest.set(node, node.quaternion.clone());
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        node.frustumCulled = false;
        const original = Array.isArray(node.material)
          ? node.material
          : [node.material];
        const materials = original.map((m) => {
          if (
            [
              "MI_Superhero_Male",
              "jersey",
              "shorts",
              "socks",
              "boots",
            ].includes(m.name)
          )
            return kit;
          const material = m.clone() as THREE.MeshStandardMaterial;
          if (material.name === "jersey")
            material.color.set(keeper ? "#9759e4" : "#f4f2e7");
          if (material.name === "shorts")
            material.color.set(keeper ? "#512784" : "#213c35");
          if (material.name === "socks")
            material.color.set(keeper ? "#713abb" : "#eeeedd");
          return material;
        });
        node.material = Array.isArray(node.material) ? materials : materials[0];
      }
    });
    return { object, rest };
  }, [asset, keeper]);
  const actor = useRef<THREE.Group>(null),
    started = useRef(0);
  useLayoutEffect(() => {
    started.current = performance.now();
  }, [shot]);
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
    const t = shot
      ? reducedMotion
        ? 1
        : THREE.MathUtils.clamp(
            (performance.now() - started.current) / 1100,
            0,
            1,
          )
      : 0;
    const moves =
      keeper &&
      shot &&
      shot.outcome !== "wide" &&
      shot.decision?.choice !== "leave_wide";
    const dive = moves ? THREE.MathUtils.smoothstep(t, 0.13, 0.78) : 0;
    const direction = Math.sign(shot?.keeper?.x || 0);
    const kick = shot ? Math.sin(Math.min(1, t * 2.6) * Math.PI) : 0;
    actor.current.position.set(keeper ? 0 : -0.32, 0, keeper ? -5.78 : 5.17);
    actor.current.rotation.set(0, keeper ? 0 : Math.PI, 0);
    for (const [bone, q] of rig.rest) bone.quaternion.copy(q);
    rig.object.updateMatrixWorld(true);
    rotate(
      "upperarm_l",
      keeper ? -0.18 : 0,
      0,
      keeper ? -0.98 + dive * 2.1 : -1.35,
    );
    rotate(
      "upperarm_r",
      keeper ? -0.18 : 0,
      0,
      keeper ? 0.98 - dive * 2.1 : 1.35,
    );
    rotate("lowerarm_l", 0, keeper ? -0.55 : 0, keeper ? -0.15 : 0);
    rotate("lowerarm_r", 0, keeper ? 0.55 : 0, keeper ? 0.15 : 0);
    rotate("thigh_l", keeper ? -0.24 : 0, 0, keeper ? -0.12 : 0);
    rotate("thigh_r", keeper ? -0.24 : kick * 1.15, 0, keeper ? 0.12 : 0);
    rotate("calf_l", keeper ? 0.38 : 0);
    rotate("calf_r", keeper ? 0.38 : -kick * 0.3);
    rotate("spine_01", keeper ? 0.08 : -kick * 0.12);
    if (keeper) {
      actor.current.position.y = -0.04;
      actor.current.rotation.z = -direction * dive * 1.02;
      actor.current.updateMatrixWorld(true);
      if (dive > 0 && shot?.keeper) {
        const target = shot.outcome === "saved" ? shot.aim! : shot.keeper;
        const left = rig.object.getObjectByName("hand_l")!,
          right = rig.object.getObjectByName("hand_r")!;
        left.getWorldPosition(temp.l);
        right.getWorldPosition(temp.r);
        temp.p.copy(temp.l).add(temp.r).multiplyScalar(0.5);
        actor.current.position.x += (target.x * 3.66 - temp.p.x) * dive;
        actor.current.position.y += (target.y * 2.44 - temp.p.y) * dive;
      }
    } else {
      actor.current.position.z -= Math.sin(Math.min(1, t * 2) * Math.PI) * 0.27;
    }
    if (!shot && !reducedMotion)
      actor.current.position.y += Math.sin(clock.elapsedTime * 2) * 0.008;
  });
  return (
    <group ref={actor}>
      <primitive object={rig.object} />
    </group>
  );
}
