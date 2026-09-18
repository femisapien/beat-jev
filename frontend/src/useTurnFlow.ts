import { useEffect, useRef, useState, type RefObject } from "react";

type Options = {
  stage: RefObject<HTMLDivElement | null>;
  turn: number;
  view: "aim" | "flight" | "result";
  ready: boolean;
  nextReady: boolean;
  completed: boolean;
  paused: boolean;
  next: () => void;
  kick: () => Promise<void>;
};

// Turn changes belong to the game. Only the shot and save need player input.
export default function useTurnFlow(options: Options) {
  const { stage, turn, view, ready, nextReady, completed } = options;
  const [inView, setInView] = useState(false);
  const [resultSeen, setResultSeen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const actions = useRef(options);
  actions.current = options;
  const paused = options.paused || !inView;

  useEffect(() => {
    let onScreen = false;
    const update = () => setInView(onScreen && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.intersectionRatio >= 0.35;
      update();
    }, { threshold: [0, 0.35] });
    if (stage.current) observer.observe(stage.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [stage]);

  useEffect(() => {
    setResultSeen(false);
    if (view !== "result" || completed || paused) return;
    const timer = setTimeout(() => setResultSeen(true), 1200);
    return () => clearTimeout(timer);
  }, [view, turn, completed, paused]);

  useEffect(() => {
    if (view === "result" && resultSeen && nextReady && !paused && !completed)
      actions.current.next();
  }, [view, resultSeen, nextReady, paused, completed]);

  useEffect(() => {
    setCountdown(null);
    if (view !== "aim" || !ready || turn % 2 !== 0 || paused) return;
    let remaining = 3;
    setCountdown(remaining);
    const timer = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining || null);
      if (!remaining) {
        clearInterval(timer);
        if (!document.hidden) void actions.current.kick();
      }
    }, 700);
    return () => clearInterval(timer);
  }, [view, turn, ready, paused]);

  return { countdown, inView };
}
