import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as THREE from "three";

type Instance = {
  position: [number, number, number];
  scale?: [number, number, number];
  color?: string;
};
function Instances({
  geometry,
  items,
  color,
}: {
  geometry: THREE.BufferGeometry;
  items: Instance[];
  color: string;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    items.forEach((item, i) => {
      dummy.position.set(...item.position);
      dummy.scale.set(...(item.scale || [1, 1, 1]));
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
      ref.current!.setColorAt(i, new THREE.Color(item.color || color));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, [items, color]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, items.length]}
      receiveShadow
    >
      <meshStandardMaterial color="#a5a9b5" roughness={0.95} />
    </instancedMesh>
  );
}

function Turf() {
  const [color, normal] = useLoader(THREE.TextureLoader, [
    "/textures/Grass005_1K-JPG_Color.jpg",
    "/textures/Grass005_1K-JPG_NormalGL.jpg",
  ]);
  const material = useMemo(() => {
    for (const texture of [color, normal]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(42, 52);
      texture.anisotropy = 8;
    }
    color.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: color,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      color: "#829774",
      roughness: 1,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "varying vec3 fieldPosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nfieldPosition = position;",
      );
      shader.fragmentShader =
        "varying vec3 fieldPosition;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        "#include <map_fragment>\nfloat stripe = mod(floor(fieldPosition.y / 5.5), 2.0); diffuseColor.rgb *= mix(0.86, 1.0, stripe);",
      );
    };
    return mat;
  }, [color, normal]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={material}>
        <planeGeometry args={[84, 104]} />
      </mesh>
      {[
        [0, -6, 40.32, 0.1],
        [-20.16, 2.25, 0.1, 16.5],
        [20.16, 2.25, 0.1, 16.5],
        [0, 10.5, 40.32, 0.1],
        [-9.16, -3.25, 0.1, 5.5],
        [9.16, -3.25, 0.1, 5.5],
        [0, -0.5, 18.32, 0.1],
      ].map(([x, z, w, h], i) => (
        <mesh
          key={i}
          position={[x, 0.016, z]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial color="#e9e8d8" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0.018, 4.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.09, 24]} />
        <meshStandardMaterial color="#e9e8d8" />
      </mesh>
    </group>
  );
}

function Goal() {
  const net = useMemo(() => {
    const points: number[] = [];
    const line = (a: number[], b: number[]) => points.push(...a, ...b);
    for (let x = -3.66; x <= 3.67; x += 0.16) {
      line([x, 0, -7.65], [x, 2.44, -7.4]);
      line([x, 2.44, -6], [x, 2.44, -7.4]);
    }
    for (let y = 0; y <= 2.45; y += 0.16) {
      const z = -7.65 + (y / 2.44) * 0.25;
      line([-3.66, y, z], [3.66, y, z]);
      for (const x of [-3.66, 3.66]) line([x, y, -6], [x, y, z]);
    }
    for (let z = -7.6; z <= -6; z += 0.16) {
      for (const x of [-3.66, 3.66])
        line([x, 0, z], [x, 2.44, Math.max(z, -7.4)]);
      if (z >= -7.4) line([-3.66, 2.44, z], [3.66, 2.44, z]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3),
    );
    return geometry;
  }, []);
  return (
    <group>
      <lineSegments geometry={net}>
        <lineBasicMaterial color="#e4e5dd" transparent opacity={0.38} />
      </lineSegments>
      {[-3.66, 3.66].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.22, -6]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 2.5, 20]} />
            <meshStandardMaterial
              color="#faf9ed"
              roughness={0.3}
              metalness={0.15}
            />
          </mesh>
          <mesh position={[x, 0.04, -6.8]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 1.6, 8]} />
            <meshStandardMaterial
              color="#c7ccc5"
              metalness={0.5}
              roughness={0.4}
            />
          </mesh>
          <mesh position={[x, 1.24, -7.53]} rotation={[0.1, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 2.45, 8]} />
            <meshStandardMaterial
              color="#7d8582"
              metalness={0.6}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 2.44, -6]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 7.43, 20]} />
        <meshStandardMaterial
          color="#faf9ed"
          roughness={0.3}
          metalness={0.15}
        />
      </mesh>
    </group>
  );
}

function Crowd({ items }: { items: Instance[] }) {
  const asset = useLoader(GLTFLoader, "/models/spectator.glb");
  const meshes = useMemo(() => {
    const parts: { geometry: THREE.BufferGeometry; items: Instance[] }[] = [];
    asset.scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const material = node.material as THREE.MeshStandardMaterial;
      const shirt = material.name === "crowd-shirt";
      parts.push({
        geometry: node.geometry,
        items: items.map((item) => ({
          ...item,
          color: shirt ? item.color : `#${material.color.getHexString()}`,
        })),
      });
    });
    return parts;
  }, [asset, items]);
  return (
    <>
      {meshes.map((part, i) => (
        <Instances
          key={i}
          geometry={part.geometry}
          items={part.items}
          color="#777777"
        />
      ))}
    </>
  );
}

function Grandstand({
  position,
  rotation = 0,
}: {
  position: [number, number, number];
  rotation?: number;
}) {
  const data = useMemo(() => {
    const chairs: Instance[] = [],
      crowd: Instance[] = [];
    const palette = [
      "#232531",
      "#72747a",
      "#4e3867",
      "#555f70",
      "#8c8177",
      "#343e48",
      "#aaa497",
      "#56634c",
    ];
    for (let row = 0; row < 15; row++)
      for (let col = 0; col < 100; col++) {
        if (col % 25 < 3) continue;
        const x = (col - 49.5) * 0.59,
          y = 0.5 + row * 0.39,
          z = -row * 0.76;
        chairs.push({
          position: [x, y, z],
          color: row < 7 ? "#65517c" : "#586170",
        });
        const noise = ((col * 1297 + row * 7919) % 101) / 100;
        if (noise < 0.12) continue;
        crowd.push({
          position: [x, y - 0.58, z + 0.05],
          scale: [0.87, 0.91 + noise * 0.08, 0.87],
          color: palette[(col * 7 + row * 3) % palette.length],
        });
      }
    const seat = new THREE.BoxGeometry(0.43, 0.065, 0.4).translate(0, 0, 0.07);
    const back = new THREE.BoxGeometry(0.43, 0.36, 0.065).translate(
      0,
      0.18,
      -0.12,
    );
    const geometry = mergeGeometries([seat, back]);
    seat.dispose();
    back.dispose();
    return { chairs, crowd, geometry };
  }, []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: 15 }, (_, i) => (
        <mesh key={i} position={[0, i * 0.39 + 0.15, -i * 0.76]} receiveShadow>
          <boxGeometry args={[61, 0.34, 0.8]} />
          <meshStandardMaterial color="#50545a" roughness={0.95} />
        </mesh>
      ))}
      <Instances geometry={data.geometry} items={data.chairs} color="#574e66" />
      <Crowd items={data.crowd} />
      <mesh position={[0, -0.05, 0.7]}>
        <boxGeometry args={[61, 0.9, 0.25]} />
        <meshStandardMaterial color="#272c33" roughness={0.8} />
      </mesh>
      <mesh position={[0, 6.8, -5.3]} rotation={[-0.08, 0, 0]} castShadow>
        <boxGeometry args={[62, 0.22, 13]} />
        <meshStandardMaterial color="#272d38" metalness={0} roughness={1} />
      </mesh>
      <mesh position={[0, 6.5, 1.05]}>
        <boxGeometry args={[62, 0.5, 0.15]} />
        <meshStandardMaterial
          color="#252a34"
          metalness={0.45}
          roughness={0.5}
        />
      </mesh>
      {Array.from({ length: 11 }, (_, i) => (
        <group key={i} position={[-30 + i * 6, 0, 0]}>
          <mesh position={[0, 3.4, -10.7]}>
            <cylinderGeometry args={[0.09, 0.13, 6.8, 8]} />
            <meshStandardMaterial
              color="#b0b5b8"
              metalness={0.6}
              roughness={0.4}
            />
          </mesh>
          <mesh position={[0, 6.55, -5]} rotation={[Math.PI / 2 + 0.08, 0, 0]}>
            <cylinderGeometry args={[0.065, 0.065, 12, 8]} />
            <meshStandardMaterial
              color="#a3a9af"
              metalness={0.6}
              roughness={0.4}
            />
          </mesh>
          <mesh position={[0, 6.21, -0.6]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[1.35, 0.1, 0.32]} />
            <meshStandardMaterial
              color="#faf5da"
              emissive="#f5e8cb"
              emissiveIntensity={2}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Boards() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#21172e";
    ctx.fillRect(0, 0, 2048, 128);
    ctx.fillStyle = "#e9e3f4";
    ctx.font = "600 30px system-ui";
    ctx.textAlign = "center";
    ["RENDER", "BEAT JEV", "RENDER WORKFLOWS", "TYPESAFE"].forEach((label, i) =>
      ctx.fillText(label, 256 + i * 512, 79),
    );
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, 0.58, -10.5]}>
      <boxGeometry args={[33, 1.05, 0.15]} />
      <meshStandardMaterial
        map={texture}
        emissiveMap={texture}
        emissive="#ffffff"
        emissiveIntensity={0.3}
        roughness={0.55}
      />
    </mesh>
  );
}

export default function Stadium() {
  const hdr = useLoader(RGBELoader, "/textures/stadium_01_1k.hdr");
  const { scene } = useThree();
  useEffect(() => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
    };
  }, [hdr, scene]);
  return (
    <>
      <color attach="background" args={["#b6c3cb"]} />
      <fog attach="fog" args={["#b6c3cb", 60, 130]} />
      <hemisphereLight args={["#e0edff", "#3c4129", 0.5]} />
      <directionalLight
        position={[-9, 18, 8]}
        color="#fff1d6"
        intensity={3.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-normalBias={0.025}
        shadow-bias={-0.0002}
      />
      <Turf />
      <Goal />
      <Grandstand position={[0, 0.9, -17]} />
      <Grandstand position={[-30, 0.9, 15]} rotation={Math.PI / 2} />
      <Grandstand position={[30, 0.9, 15]} rotation={-Math.PI / 2} />
      <Boards />
    </>
  );
}
