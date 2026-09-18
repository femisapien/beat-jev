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
import { language, serverTime } from "./api";
import useGame from "./useGame";
import {
  directPath,
  groundAim,
  missLabel,
  endMs,
  type Playback,
} from "./playback";
import { ProjectLinks, PoweredByRender } from "./ProjectLinks";
import Panel from "./Panel";
import WorkflowProgress from "./WorkflowProgress";
import Trace from "./Trace";
import { renderLink } from "../../shared/links";
import type { Aim } from "../../shared/types";
const GameScene = lazy(() => import("./GameScene"));
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
  const { session, game, trace, history, error, sending, dispatch } = useGame();
  const [name, setName] = useState(
    localStorage.getItem("beat-jev-name") || "Guest",
  );
  const [aim, setAim] = useState<Aim>({ x: 0.65, y: 0.65 });
  const [flight, setFlight] = useState<Playback | null>(null);
  const [view, setView] = useState<"aim" | "flight" | "result">("aim");
  const [landed, setLanded] = useState(false),
    [about, setAbout] = useState(false);
  const [reducedMotion, setReduced] = useState(
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const seen = useRef(0);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const latest = game?.activeShot || game?.shots.at(-1);
    if (!latest) return;
    if (flight && latest.number === flight.number && !flight.reaction) {
      // The ball clock never resets when the keeper's answer arrives.
      setFlight((p) =>
        p ? { ...p, reaction: latest, keeperStartedAt: performance.now() } : p,
      );
    } else if (!flight && latest.number > seen.current) {
      seen.current = latest.number;
      setFlight({
        number: latest.number,
        aim: latest.aim!,
        path: latest.path || directPath(latest.aim!),
        startedAt: performance.now() - endMs,
        reaction: latest,
        keeperStartedAt: performance.now() - 500,
      });
      setLanded(true);
      setView("result");
    }
  }, [game, flight]);
  useEffect(() => {
    if (!flight || view !== "flight") return;
    const timer = setTimeout(
      () => setLanded(true),
      Math.max(0, endMs - (performance.now() - flight.startedAt)),
    );
    return () => clearTimeout(timer);
  }, [flight?.startedAt, view]);
  useEffect(() => {
    if (landed && flight?.reaction) setView("result");
  }, [landed, flight?.reaction]);
  const shot = flight?.reaction;
  const ready =
    !!game?.ready && !!game.turn?.ready && view === "aim" && !sending && !error;
  function start() {
    seen.current = 0;
    setFlight(null);
    setLanded(false);
    setView("aim");
    localStorage.setItem("beat-jev-name", name.trim() || "Guest");
    void dispatch({
      action: "start",
      matchId: crypto.randomUUID(),
      name: name.trim() || "Guest",
    });
  }
  function shoot(target: Aim, path?: Aim[]) {
    if (!ready || !game) return;
    const a = groundAim(target),
      trajectory = path || directPath(a),
      number = game.attempts + 1;
    seen.current = number;
    setAim(a);
    setLanded(false);
    setView("flight");
    setFlight({
      number,
      aim: a,
      path: trajectory,
      startedAt: performance.now(),
    });
    void dispatch({
      action: "shoot",
      matchId: game.id,
      number,
      aim: a,
      path: trajectory,
      releasedAt: serverTime(),
    });
  }
  function next() {
    setFlight(null);
    setLanded(false);
    setView("aim");
  }
  const completed = view === "result" && shot?.number === 5;
  const visibleShots = (game?.shots || []).filter(
    (s) => !(view === "flight" && s.number === flight?.number),
  );
  if (
    view === "result" &&
    shot &&
    !visibleShots.some((s) => s.number === shot.number)
  )
    visibleShots.push(shot);
  const goals = visibleShots.filter((s) => s.outcome === "goal").length;
  const message =
    shot?.outcome === "goal"
      ? "GOAL!"
      : shot?.outcome === "saved"
        ? "SAVED"
        : missLabel(shot?.aim);
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
                    ArrowDown: { ...aim, y: Math.max(0.06, aim.y - delta) },
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
                      flight={flight}
                      onComplete={() => setLanded(true)}
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
                {ready && (
                  <div className="aim-hint">
                    Tap a spot or draw a path <span>·</span> Release to shoot
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
                          ? shot?.reaction === "late"
                            ? "Jev was too late."
                            : shot?.reaction === "unavailable"
                              ? "Jev could not respond."
                              : "Past the keeper."
                          : shot?.outcome === "saved"
                            ? "Jev read that one."
                            : shot?.aim && shot.aim.y > 0.965
                              ? "Over the crossbar."
                              : "Outside the posts."
                        : ready
                          ? `Penalty ${(game?.attempts || 0) + 1} of 5`
                          : view === "flight"
                            ? landed
                              ? "Checking the result…"
                              : "Ball in play"
                            : "Preparing the next shot…"}
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
                    disabled={!game?.ready || !game?.turn?.ready}
                    onClick={next}
                  >
                    {game?.turn?.ready ? "Next shot" : "Preparing…"}
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
                        {view === "flight"
                          ? landed
                            ? "Finishing"
                            : "In flight"
                          : "Preparing"}
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
            history={history}
            turn={game?.turn}
            released={session?.command.action === "shoot"}
            waiting={sending || (!!session && !trace)}
            shot={shot}
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
            Tap a spot or draw a path. Releasing starts the kick. Jev has 850 ms
            from release to choose a move. Late decisions cannot save.
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
            your shot on release and applies Jev’s returned move; it does not
            run the animation frames on Render.
          </p>
          <p className="muted">
            A nickname is enough. Your record belongs to this browser. Current
            shot coordinates go to TypeSafe; your nickname is not sent. The side
            panel shows real task runs and Jev’s latest decision.
          </p>
        </Panel>
      )}
    </div>
  );
}
