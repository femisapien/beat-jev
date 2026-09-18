import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Aim, Kick } from "../../shared/types";
import { groundAim } from "./playback";
import { flightPath } from "../../shared/flight";
import { kickFromGesture } from "./gesture";
type Props = {
  ready: boolean;
  aim: Aim;
  onAim: (a: Aim) => void;
  onShoot: (a: Aim, kick: Kick) => void;
};
type Point = { x: number; y: number };
// Use client coordinates relative to the canvas, independent of event targets.
export function projectPointer(
  p: Point,
  rect: { left: number; top: number; width: number; height: number },
  camera: THREE.Camera,
  z = -6,
) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      ((p.x - rect.left) / rect.width) * 2 - 1,
      1 - ((p.y - rect.top) / rect.height) * 2,
    ),
    camera,
  );
  const hit = ray.ray.intersectPlane(
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -z),
    new THREE.Vector3(),
  );
  return hit || new THREE.Vector3(0, 0.14, z);
}
export default function ShotInput(props: Props) {
  const { gl, camera } = useThree();
  const current = useRef(props);
  current.current = props;
  const [preview, setPreview] = useState<Aim[]>([]);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const points = preview.map(
      (p, i) =>
        new THREE.Vector3(
          p.x * 3.66,
          p.y * 2.44,
          4.5 - (10.5 * i) / Math.max(1, preview.length - 1),
        ),
    );
    g.setFromPoints(points.slice(1).flatMap((p, i) => [points[i], p]));
    return g;
  }, [preview]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    const canvas = gl.domElement;
    let stroke: Point[] = [];
    let pointer: number | null = null;
    const point = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });
    const aimAt = (p: Point) => {
      const v = projectPointer(p, canvas.getBoundingClientRect(), camera);
      return groundAim({ x: v.x / 3.66, y: v.y / 2.44 });
    };
    let started = 0;
    const kickFor = (points: Point[]) =>
      kickFromGesture(
        points,
        performance.now() - started,
        canvas.getBoundingClientRect().height,
      );
    function down(e: PointerEvent) {
      if (!current.current.ready || pointer !== null) return;
      e.preventDefault();
      pointer = e.pointerId;
      stroke = [point(e)];
      started = performance.now();
      canvas.setPointerCapture(pointer);
      current.current.onAim(aimAt(point(e)));
    }
    function move(e: PointerEvent) {
      if (!current.current.ready) return;
      current.current.onAim(aimAt(point(e)));
      if (pointer === e.pointerId) {
        const p = point(e),
          last = stroke.at(-1)!;
        if (Math.hypot(p.x - last.x, p.y - last.y) > 4) {
          stroke.push(p);
          if (stroke.length > 128)
            stroke = stroke.filter((_, i) => i % 2 === 0);
          setPreview(flightPath(aimAt(p), kickFor(stroke)));
        }
      }
    }
    function up(e: PointerEvent) {
      if (pointer !== e.pointerId) return;
      const points = [...stroke, point(e)];
      pointer = null;
      canvas.releasePointerCapture(e.pointerId);
      setPreview([]);
      if (!current.current.ready) return;
      const a = aimAt(point(e));
      current.current.onShoot(a, kickFor(points));
    }
    function cancel() {
      pointer = null;
      stroke = [];
      setPreview([]);
    }
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
    };
  }, [gl, camera]);
  if (!props.ready) return null;
  const outside = Math.abs(props.aim.x) > 0.965 || props.aim.y > 0.965;
  return (
    <group>
      {preview.length > 1 && (
        <lineSegments geometry={geometry}>
          <lineBasicMaterial color="#ddff9a" />
        </lineSegments>
      )}
      <group position={[props.aim.x * 3.66, props.aim.y * 2.44, -5.86]}>
        <mesh>
          <ringGeometry args={[0.12, 0.14, 32]} />
          <meshBasicMaterial
            color={outside ? "#ffb49c" : "#ddff9a"}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh>
          <circleGeometry args={[0.025, 16]} />
          <meshBasicMaterial color={outside ? "#ffb49c" : "#ddff9a"} />
        </mesh>
      </group>
    </group>
  );
}
