import { useEffect, useRef, useState } from "react";
import type { Aim } from "../../shared/types";
export default function useKeeperControls(enabled: boolean) {
  const position = useRef<Aim>({ x: 0, y: 0.25 });
  const held = useRef(new Set<string>());
  const [keeper, setKeeper] = useState(position.current);
  function reset(value: Aim = { x: 0, y: 0.25 }) {
    held.current.clear();
    position.current = value;
    setKeeper(position.current);
  }
  function press(key: string, down: boolean) {
    if (!enabled) return;
    if (down) held.current.add(key);
    else held.current.delete(key);
  }
  useEffect(() => {
    if (!enabled) {
      held.current.clear();
      return;
    }
    let frame = 0,
      previous = performance.now();
    const keys: Record<string, string> = {
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
      Space: "jump",
      ArrowUp: "jump",
      KeyW: "jump",
    };
    const key = (e: KeyboardEvent) => {
      if (!keys[e.code] || (e.target as HTMLElement)?.matches("input,textarea"))
        return;
      e.preventDefault();
      press(keys[e.code], e.type === "keydown");
    };
    const blur = () => held.current.clear();
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", blur);
    const tick = (now: number) => {
      const dt = Math.min(0.04, (now - previous) / 1000);
      previous = now;
      const x = Math.max(
        -0.9,
        Math.min(
          0.9,
          position.current.x +
            (Number(held.current.has("right")) -
              Number(held.current.has("left"))) *
              1.6 *
              dt,
        ),
      );
      const y = held.current.has("jump") ? 0.76 : 0.25;
      if (x !== position.current.x || y !== position.current.y) {
        position.current = { x: Math.round(x * 1000) / 1000, y };
        setKeeper(position.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", blur);
      held.current.clear();
    };
  }, [enabled]);
  return { keeper, position, reset, press };
}
