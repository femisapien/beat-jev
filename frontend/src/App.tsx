import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  Component,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  RotateCcw,
  ArrowRight,
  LoaderCircle,
  Check,
  X,
} from "lucide-react";
import { api, language, sessionKey, type Play, type Session } from "./api";
import { ProjectLinks, PoweredByRender } from "./ProjectLinks";
import Panel from "./Panel";
import WorkflowProgress from "./WorkflowProgress";
import Trace from "./Trace";
import { renderLink } from "../../shared/links";
import type { Aim, Game, Shot, Trace as TraceData } from "../../shared/types";
const GameScene = lazy(() => import("./GameScene"));
const readSession = (): Session | null => {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) || "null");
  } catch {
    return null;
  }
};
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        3D is unavailable. Use the direction controls below to play.
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const [session, setSession] = useState<Session | null>(readSession),
    [game, setGame] = useState<Game | null>(null),
    [trace, setTrace] = useState<TraceData | null>(null);
  const [history, setHistory] = useState<TraceData[]>([]);
  function addTrace(t: TraceData) {
    setHistory((prev) => {
      const i = prev.findIndex((p) => p.id === t.id);
      return i < 0 ? [...prev, t] : prev.map((p) => (p.id === t.id ? t : p));
    });
  }
  const [name, setName] = useState(
    localStorage.getItem("beat-jev-name") || "Guest",
  );
  const [aim, setAim] = useState<Aim>({ x: 0.65, y: 0.65 }),
    [view, setView] = useState<"aim" | "flight" | "result">("aim"),
    [shot, setShot] = useState<Shot | null>(null);
  const [error, setError] = useState(""),
    [sending, setSending] = useState(false),
    [about, setAbout] = useState(false);
  const [reducedMotion, setReduced] = useState(
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const seen = useRef(0),
    requestSequence = useRef(0);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  function remember(s: Session) {
    setSession(s);
    localStorage.setItem(sessionKey, JSON.stringify(s));
  }
  async function dispatch(command: Play) {
    if (sending) return;
    const seq = ++requestSequence.current;
    setSending(true);
    setError("");
    setTrace(null);
    const runIds =
      session?.matchId === command.matchId ? session.runIds || [] : [];
    remember({ matchId: command.matchId, command, runIds });
    try {
      const result = await api<{ runId: string }>("/play", command);
      if (seq !== requestSequence.current) return;
      remember({
        matchId: command.matchId,
        command,
        runId: result.runId,
        runIds: [...runIds, result.runId],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  function start() {
    seen.current = 0;
    setHistory([]);
    setGame(null);
    setShot(null);
    setView("aim");
    setTrace(null);
    localStorage.setItem("beat-jev-name", name.trim() || "Guest");
    void dispatch({
      action: "start",
      matchId: crypto.randomUUID(),
      name: name.trim() || "Guest",
    });
  }
  useEffect(() => {
    let active = true;
    const previous = (session?.runIds || []).filter(
      (id) => id !== session?.runId && !history.some((t) => t.id === id),
    );
    void Promise.all(
      previous.map((id) => api<TraceData>(`/runs/${id}`).catch(() => null)),
    ).then((items) => {
      if (active) for (const t of items) if (t) addTrace(t);
    });
    return () => {
      active = false;
    };
  }, [session?.runIds?.join(",")]);
  useEffect(() => {
    if (!session?.runId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    const refresh = async () => {
      if (!active) return;
      try {
        const [g, t] = await Promise.all([
          api<Game>(`/matches/${session.matchId}`).catch(() => null),
          api<TraceData>(`/runs/${session.runId}`).catch(() => null),
        ]);
        if (!active) return;
        if (g) {
          setGame(g);
          const latest = g.shots.at(-1);
          if (latest && latest.number > seen.current) {
            seen.current = latest.number;
            setShot(latest);
            setView("flight");
          }
        }
        if (t) {
          setTrace(t);
          addTrace(t);
          if (["failed", "canceled"].includes(t.status)) {
            setError(
              "The task stopped. Retry to continue from the saved state.",
            );
            return;
          }
          if (t.status === "completed" && g) {
            setError("");
            return;
          }
        }
        if (++count > 160) {
          setError(
            "This is taking longer than expected. Retry to check the saved state.",
          );
          return;
        }
      } catch {
        /* Try reading the same match again. No new shot is submitted. */
      }
      timer = setTimeout(refresh, 700);
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [session?.runId, session?.matchId]);
  useEffect(() => {
    if (session && !session.runId && !sending)
      setError("Your last action was interrupted. Retry to continue.");
  }, []);
  useEffect(() => {
    if (!shot || view !== "flight") return;
    // Also finishes a shot when WebGL is unavailable or rendering is suspended.
    const timer = setTimeout(() => setView("result"), reducedMotion ? 0 : 1250);
    return () => clearTimeout(timer);
  }, [shot, view, reducedMotion]);
  const ready =
    !!game?.ready &&
    trace?.status === "completed" &&
    view === "aim" &&
    !sending &&
    !error;
  function shoot(target: Aim) {
    if (!ready || !game) return;
    setAim(target);
    setView("flight");
    setShot(null);
    void dispatch({
      action: "shoot",
      matchId: game.id,
      number: game.attempts + 1,
      aim: target,
    });
  }
  function next() {
    setShot(null);
    setView("aim");
  }
  const completed = view === "result" && game?.attempts === 5;
  const visibleShots =
    game?.shots.filter((s) => view !== "flight" || s.number !== shot?.number) ||
    [];
  const goals = visibleShots.filter((s) => s.outcome === "goal").length;
  const busy = !!session && !ready && view !== "result";
  const message = error
    ? "Connection interrupted"
    : view === "result"
      ? shot?.outcome === "goal"
        ? "GOAL!"
        : shot?.outcome === "saved"
          ? "SAVED"
          : "WIDE"
      : !session
        ? "You vs. Jev"
        : ready
          ? "Pick your spot."
          : sending || session?.command.action === "shoot"
            ? "Playing your penalty…"
            : "Jev is getting ready…";
  return (
    <div className="app">
      <header>
        <a className="brand" href="/" aria-label="Beat Jev home">
          <img src="/render-mark.svg" alt="Render" />
          <span>
            Beat Jev<span className="brand-slash"> / </span>
            <small>Penalty shootout</small>
          </span>
        </a>
        <nav>
          <button className="text-button how" onClick={() => setAbout(true)}>
            How it works
          </button>
          <ProjectLinks />
        </nav>
      </header>
      <main>
        <div className="intro">
          <div>
            <div className="eyebrow">YOU HAVE FIVE SHOTS</div>
            <h1>Can you beat Jev?</h1>
          </div>
          <p>Pick a corner. Beat the keeper.</p>
        </div>
        <WorkflowProgress game={game} session={session} trace={trace} />
        <div className="game-layout">
          <div className="play-column">
            <section className="game" aria-label="Penalty shootout">
              <div className="scoreboard">
                <div className="player-label">
                  <span className="kit-dot" />
                  {game?.name || name}
                  <small>YOU</small>
                </div>
                <div className="score">
                  <strong>{goals}</strong>
                  <span>/ 5</span>
                </div>
                <div className="keeper-label">
                  <small>GOALKEEPER</small>
                  <span>
                    Jev
                    <span className="kit-dot purple" />
                  </span>
                </div>
              </div>
              <div
                className="stage"
                tabIndex={0}
                role="group"
                aria-label="Aim on the pitch. Arrow keys move the target, Space shoots."
                onKeyDown={(e) => {
                  if (!ready) return;
                  const delta = 0.12;
                  const targets: Record<string, Aim> = {
                    ArrowLeft: { ...aim, x: Math.max(-1.6, aim.x - delta) },
                    ArrowRight: { ...aim, x: Math.min(1.6, aim.x + delta) },
                    ArrowUp: { ...aim, y: Math.min(1.5, aim.y + delta) },
                    ArrowDown: { ...aim, y: Math.max(-0.4, aim.y - delta) },
                  };
                  if (targets[e.key]) {
                    e.preventDefault();
                    setAim(targets[e.key]);
                  }
                  if (e.code === "Space" || e.key === "Enter") {
                    e.preventDefault();
                    shoot(aim);
                  }
                }}
              >
                <SceneBoundary>
                  <Suspense
                    fallback={
                      <div className="scene-fallback">
                        <LoaderCircle className="spin" />
                        Loading the pitch
                      </div>
                    }
                  >
                    <GameScene
                      aim={aim}
                      onAim={setAim}
                      onShoot={shoot}
                      ready={ready}
                      shot={shot}
                      onComplete={() => setView("result")}
                      reducedMotion={reducedMotion}
                    />
                  </Suspense>
                </SceneBoundary>
                <div className="stage-top">
                  <span className="venue">THE TRAINING GROUND</span>
                  <span className="live-tag">
                    <i /> {language === "python" ? "Python" : "TypeScript"} SDK
                  </span>
                </div>
                {!session && (
                  <div className="start-overlay">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        start();
                      }}
                    >
                      <label htmlFor="player-name">Player name</label>
                      <div>
                        <input
                          id="player-name"
                          maxLength={24}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          autoComplete="nickname"
                        />
                        <button className="primary" type="submit">
                          Play <ArrowRight size={18} />
                        </button>
                      </div>
                      <span>Five shots. No sign-up.</span>
                    </form>
                  </div>
                )}
                {view === "result" && (
                  <div className={"result-word " + shot?.outcome} role="status">
                    {message}
                  </div>
                )}
                {session && view === "flight" && !shot && (
                  <div className="pending-pill">
                    <LoaderCircle className="spin" size={15} />
                    Jev is reading your shot
                  </div>
                )}
                {ready && (
                  <div className="aim-hint">
                    Tap a spot to shoot <span>·</span> Arrows + Space on
                    keyboard
                  </div>
                )}
              </div>
              <div className="game-controls">
                <div
                  className="shot-markers"
                  aria-label={`${visibleShots.length} of 5 attempts`}
                >
                  {Array.from({ length: 5 }, (_, i) => {
                    const s = visibleShots[i];
                    return (
                      <span
                        key={i}
                        className={
                          s?.outcome ||
                          (i === visibleShots.length && session
                            ? "current"
                            : "")
                        }
                        aria-label={`Penalty ${i + 1}: ${s?.outcome || "not taken"}`}
                      >
                        {s?.outcome === "goal" ? (
                          <Check size={16} />
                        ) : s ? (
                          <X size={16} />
                        ) : (
                          i + 1
                        )}
                      </span>
                    );
                  })}
                </div>
                <div className="turn-status" aria-live="polite">
                  {!session
                    ? "Step up to the spot."
                    : completed
                      ? `${goals} ${goals === 1 ? "goal" : "goals"} from 5 shots.`
                      : view === "result"
                        ? shot?.outcome === "goal"
                          ? "Past the keeper."
                          : shot?.outcome === "saved"
                            ? "Jev read that one."
                            : "Outside the goal."
                        : ready
                          ? `Penalty ${(game?.attempts || 0) + 1} of 5`
                          : busy
                            ? "Workflow running…"
                            : ""}
                </div>
                {error ? (
                  <button
                    className="primary"
                    onClick={() => session && dispatch(session.command)}
                  >
                    <RotateCcw size={16} />
                    Retry
                  </button>
                ) : completed ? (
                  <button
                    className="primary"
                    onClick={start}
                    disabled={!game?.finished || trace?.status !== "completed"}
                  >
                    <RotateCcw size={16} />
                    Try again
                  </button>
                ) : view === "result" ? (
                  <button
                    className="primary"
                    disabled={!game?.ready || trace?.status !== "completed"}
                    onClick={next}
                  >
                    {game?.ready ? "Next shot" : "Preparing…"}
                    <ArrowRight size={16} />
                  </button>
                ) : session ? (
                  <button
                    className="primary"
                    disabled={!ready}
                    onClick={() => shoot(aim)}
                  >
                    {ready ? (
                      "Shoot"
                    ) : (
                      <>
                        <LoaderCircle size={16} className="spin" />
                        Preparing
                      </>
                    )}
                  </button>
                ) : (
                  <span className="controls-note">Can you score all five?</span>
                )}
              </div>
            </section>
            {error && (
              <p className="error" role="alert">
                {error} Your saved shots are safe.
              </p>
            )}
            <div className="below-game">
              <div className="career">
                <span>Your record</span>
                <strong>
                  {game?.totalGoals || 0}
                  <small> goals</small>
                </strong>
                <span>{game?.totalAttempts || 0} attempts</span>
              </div>
            </div>
            <details className="keyboard-controls">
              <summary>Direction controls</summary>
              <div>
                {[
                  ["High left", -0.62, 0.76],
                  ["High center", 0, 0.76],
                  ["High right", 0.62, 0.76],
                  ["Low left", -0.62, 0.25],
                  ["Low center", 0, 0.25],
                  ["Low right", 0.62, 0.25],
                ].map(([label, x, y]) => (
                  <button
                    key={label}
                    disabled={!ready}
                    onClick={() => shoot({ x: Number(x), y: Number(y) })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </details>
          </div>
          <Trace
            trace={trace}
            history={history
              .slice()
              .sort(
                (a, b) =>
                  (session?.runIds || []).indexOf(a.id) -
                  (session?.runIds || []).indexOf(b.id),
              )}
            waiting={sending || (!!session && !trace)}
            shot={view === "result" ? shot || undefined : undefined}
          />
        </div>
      </main>
      <footer>
        <PoweredByRender />
        <a
          href={renderLink(
            "https://dashboard.render.com/register",
            "footer_signup",
          )}
          target="_blank"
          rel="noopener noreferrer"
        >
          Build your own <ArrowUpRight size={14} />
        </a>
      </footer>
      {about && (
        <Panel title="How it works" close={() => setAbout(false)}>
          <h2>You shoot. Jev reacts.</h2>
          <p>
            Jev receives the ball’s projected crossing and chooses where to
            defend. Aim near a corner to beat its reach.
          </p>
          <ol>
            <li>
              <strong>Render Workflows</strong> saves the player, starts the
              match, runs each penalty, and finalizes the score.
            </li>
            <li>
              <strong>TypeSafe Jev</strong> returns a defensive zone or chooses
              to leave a miss, with probabilities for each action.
            </li>
            <li>
              <strong>Render Postgres</strong> keeps your shots and score.
              Retrying cannot count the same penalty twice.
            </li>
          </ol>
          <p>
            Code calculates the trajectory and checks saves. The browser plays
            the saved result after the workflow responds; it does not run the
            animation frames on Render.
          </p>
          <p className="muted">
            A nickname is enough. Your record belongs to this browser. Current
            shot coordinates go to TypeSafe; your nickname is not sent. Open the
            workflow strip to inspect the real task runs and Jev’s latest
            decision.
          </p>
        </Panel>
      )}
    </div>
  );
}
