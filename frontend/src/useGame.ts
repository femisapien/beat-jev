import { useEffect, useRef, useState } from "react";
import { api, sessionKey, type Play, type Session } from "./api";
import type { Game, Trace } from "../../shared/types";
const terminal = (s: string) => ["completed", "failed", "canceled"].includes(s);
function restore(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) || "null");
  } catch {
    return null;
  }
}
export default function useGame() {
  const [session, setSession] = useState<Session | null>(restore),
    [game, setGame] = useState<Game | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null),
    [history, setHistory] = useState<Trace[]>([]);
  const [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  const latest = useRef(session),
    busy = useRef(false);
  function remember(s: Session) {
    latest.current = s;
    setSession(s);
    localStorage.setItem(sessionKey, JSON.stringify(s));
  }
  function add(t: Trace) {
    setHistory((prev) => [...prev.filter((p) => p.id !== t.id), t]);
  }
  async function dispatch(command: Play) {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setError("");
    const prior = latest.current;
    const same = prior?.matchId === command.matchId;
    const runIds = same ? prior.runIds || [] : [];
    if (!same) {
      setGame(null);
      setHistory([]);
    }
    if (command.action !== "shoot") setTrace(null);
    const pending = {
      matchId: command.matchId,
      command,
      runIds,
      ...(command.action === "shoot" ? { runId: prior?.runId } : {}),
    };
    remember(pending);
    try {
      const response = await api<{ runId?: string }>("/play", command);
      if (response.runId)
        remember({
          ...pending,
          runId: response.runId,
          runIds: [...runIds, response.runId],
        });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setSending(false);
    }
  }
  useEffect(() => {
    if (!session?.matchId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let delay = 450;
      try {
        const g = await api<Game>(`/matches/${session.matchId}`);
        if (active) setGame(g);
        if (g.finished) return;
        if (latest.current?.command.action === "shoot")
          delay = g.activeShot ? 250 : 80;
      } catch {}
      if (active) timer = setTimeout(poll, delay);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session?.matchId, session?.command.action]);
  useEffect(() => {
    if (!session?.runId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const t = await api<Trace>(`/runs/${session.runId}`);
        if (!active) return;
        setTrace(t);
        add(t);
        if (terminal(t.status)) {
          if (t.status !== "completed")
            setError("The task stopped. Retry the saved action.");
          return;
        }
      } catch {}
      if (active) timer = setTimeout(poll, 700);
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session?.runId]);
  useEffect(() => {
    let active = true;
    const prior = (session?.runIds || []).filter(
      (id) => id !== session?.runId && !history.some((t) => t.id === id),
    );
    void Promise.all(
      prior.map((id) => api<Trace>(`/runs/${id}`).catch(() => null)),
    ).then((items) => {
      if (active) items.forEach((t) => t && add(t));
    });
    return () => {
      active = false;
    };
  }, [session?.runIds?.join(",")]);
  // Prepare the next pair of tasks while the previous result is on screen.
  useEffect(() => {
    if (
      game?.ready &&
      trace?.status === "completed" &&
      session?.command.action !== "arm" &&
      !sending &&
      !error
    )
      void dispatch({
        action: "arm",
        matchId: game.id,
        number: game.attempts + 1,
      });
  }, [
    game?.ready,
    game?.attempts,
    trace?.status,
    session?.command.action,
    sending,
    error,
  ]);
  useEffect(() => {
    if (session && !session.runId && !sending)
      setError("Your last action was interrupted. Retry to continue.");
  }, []);
  const expired =
    session?.command.action === "arm" &&
    game?.turn?.expired &&
    !game.turn.submitted;
  return {
    session,
    game,
    trace,
    history: history
      .slice()
      .sort(
        (a, b) =>
          (session?.runIds || []).indexOf(a.id) -
          (session?.runIds || []).indexOf(b.id),
      ),
    error: expired ? "The ready window ended. Prepare your shot again." : error,
    sending,
    dispatch,
  };
}
