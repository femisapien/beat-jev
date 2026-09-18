import { useMemo } from "react";
import * as THREE from "three";

// A truncated icosahedron: 12 black pentagons and 20 white hexagons.
export default function Football() {
  const panels = useMemo(() => {
    const source = new THREE.IcosahedronGeometry(1, 0).getAttribute("position");
    const vertices: THREE.Vector3[] = [],
      faces: number[][] = [];
    for (let i = 0; i < source.count; i += 3) {
      faces.push(
        [0, 1, 2].map((j) => {
          const p = new THREE.Vector3().fromBufferAttribute(source, i + j);
          let index = vertices.findIndex((v) => v.distanceTo(p) < 0.001);
          if (index < 0) {
            index = vertices.length;
            vertices.push(p);
          }
          return index;
        }),
      );
    }
    const edge = (a: number, b: number) =>
      vertices[a]
        .clone()
        .lerp(vertices[b], 1 / 3)
        .normalize();
    const polygons = faces.map(([a, b, c]) => ({
      points: [
        edge(a, b),
        edge(b, a),
        edge(b, c),
        edge(c, b),
        edge(c, a),
        edge(a, c),
      ],
      dark: false,
    }));
    vertices.forEach((v, i) => {
      const neighbors = new Set(
        faces
          .filter((f) => f.includes(i))
          .flat()
          .filter((n) => n !== i),
      );
      const points = [...neighbors].map((n) => edge(i, n));
      const u = points[0].clone().sub(v).normalize(),
        w = new THREE.Vector3().crossVectors(v, u).normalize();
      points.sort(
        (a, b) =>
          Math.atan2(a.dot(w), a.dot(u)) - Math.atan2(b.dot(w), b.dot(u)),
      );
      polygons.push({ points, dark: true });
    });
    return [false, true].map((dark) => {
      const positions: number[] = [];
      polygons
        .filter((p) => p.dark === dark)
        .forEach(({ points }) => {
          const center = points
            .reduce((a, p) => a.add(p), new THREE.Vector3())
            .normalize();
          points.forEach((p, i) => {
            const a = p.clone().lerp(center, 0.025).normalize();
            const b = points[(i + 1) % points.length]
              .clone()
              .lerp(center, 0.025)
              .normalize();
            for (let s = 0; s < 4; s++) {
              const left = a
                .clone()
                .lerp(b, s / 4)
                .normalize()
                .multiplyScalar(0.14);
              const right = a
                .clone()
                .lerp(b, (s + 1) / 4)
                .normalize()
                .multiplyScalar(0.14);
              positions.push(
                ...center.clone().multiplyScalar(0.14).toArray(),
                ...left.toArray(),
                ...right.toArray(),
              );
            }
          });
        });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.computeVertexNormals();
      return geometry;
    });
  }, []);
  return (
    <group>
      <mesh castShadow>
        <sphereGeometry args={[0.136, 24, 16]} />
        <meshStandardMaterial color="#333b40" roughness={0.85} />
      </mesh>
      {panels.map((geometry, i) => (
        <mesh key={i} geometry={geometry} castShadow>
          <meshStandardMaterial
            color={i ? "#18222b" : "#fff9e9"}
            roughness={0.64}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
