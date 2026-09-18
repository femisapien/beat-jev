import { useEffect, useRef, useState } from "react";
import { api, sessionKey, type Play, type Session } from "./api";
import type { Game, Trace, Shot } from "../../shared/types";
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
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  const latest = useRef(session),
    busy = useRef(false);
  function remember(s: Session) {
    latest.current = s;
    setSession(s);
    localStorage.setItem(sessionKey, JSON.stringify(s));
  }
  async function dispatch(command: Play) {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setError("");
    const prior = latest.current;
    const same = prior?.matchId === command.matchId;
    if (!same) {
      setGame(null);
    }
    if (!same) setTrace(null);
    const pending = {
      matchId: command.matchId,
      command,
      ...(same ? { runId: prior?.runId } : {}),
    };
    remember(pending);
    try {
      const response = await api<{ runId?: string; attack?: Shot }>(
        "/play",
        command,
      );
      if (response.runId)
        remember({
          ...pending,
          runId: response.runId,
        });
      return response;
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
        if (g.finished || g.abandoned) return;
        if (
          ["shoot", "ready", "defend"].includes(
            latest.current?.command.action || "",
          )
        )
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
    if (session && !session.runId && !sending)
      setError("Your last action was interrupted. Retry to continue.");
  }, []);
  return {
    session,
    game,
    trace,
    error,
    sending,
    dispatch,
  };
}
