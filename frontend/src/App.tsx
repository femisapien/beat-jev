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
import useKeeperControls from "./useKeeperControls";
import useTurnFlow from "./useTurnFlow";
import { directPath, groundAim, missLabel, type Playback } from "./playback";
import { ProjectLinks, PoweredByRender } from "./ProjectLinks";
import Panel from "./Panel";
import WorkflowProgress from "./WorkflowProgress";
import Trace from "./Trace";
import { renderLink } from "../../shared/links";
import type { Aim, Kick, Shot } from "../../shared/types";
import { defaultKick, impactTime, endTime } from "../../shared/flight";
import config from "../../shared/game.json";
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
  const { session, game, trace, error, sending, dispatch } = useGame();
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
  const seen = useRef(0),
    startingJev = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const [keeperActive, setKeeperActive] = useState(false);
  const [struck, setStruck] = useState(false);
  useEffect(() => {
    setStruck(false);
    if (!flight) return;
    const id = setTimeout(
      () => setStruck(true),
      Math.max(0, config.runupMs - (performance.now() - flight.startedAt)),
    );
    return () => clearTimeout(id);
  }, [flight?.startedAt]);
  const turn = flight?.number || game?.turn?.number || 1;
  const defending = turn % 2 === 0;
  const completed = view === "result" && flight?.reaction?.number === 10;
  const ready =
    !!game?.ready && !!game.turn?.ready && view === "aim" && !sending && !error;
  const { countdown, inView } = useTurnFlow({
    stage,
    turn,
    view,
    ready,
    nextReady:
      !!game?.ready && !!game.turn?.ready && game.turn.number === turn + 1,
    completed,
    paused: about || !!error || !!game?.abandoned,
    next,
    kick: faceJev,
  });
  const controls = useKeeperControls(
    (keeperActive || countdown !== null) && inView && !about,
  );
  useEffect(() => {
    if (ready && inView && !about)
      stage.current?.focus({ preventScroll: true });
  }, [ready, turn, inView, about]);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  function incoming(shot: Shot, elapsed = 0) {
    seen.current = shot.number;
    setFlight({
      number: shot.number,
      shooter: "jev",
      aim: shot.aim!,
      path: shot.path!,
      kick: shot.kick,
      startedAt: performance.now() - elapsed,
    });
    setLanded(false);
    setKeeperActive(elapsed < impactTime(shot.kick));
    setView("flight");
  }
  useEffect(() => {
    if (!game) return;
    const latest = flight
      ? game.activeShot?.number === flight.number
        ? game.activeShot
        : game.shots.find((s) => s.number === flight.number)
      : game.shots.at(-1);
    if (flight && latest && !flight.reaction) {
      setFlight((p) =>
        p ? { ...p, reaction: latest, keeperStartedAt: performance.now() } : p,
      );
    } else if (!flight && latest && latest.number > seen.current) {
      seen.current = latest.number;
      setFlight({
        number: latest.number,
        shooter: latest.shooter,
        aim: latest.aim!,
        path: latest.path || directPath(latest.aim!),
        kick: latest.kick,
        startedAt: performance.now() - endTime(latest.kick),
        reaction: latest,
        positioning: latest.positioning,
        keeperStartedAt: performance.now() - 500,
      });
      if (latest.shooter === "jev") {
        controls.reset(latest.keeper);
      }
      setLanded(true);
      setView("result");
    } else if (
      !flight &&
      game.incomingShot &&
      game.incomingShot.number > seen.current &&
      !startingJev.current
    ) {
      incoming(
        game.incomingShot,
        Math.max(
          0,
          serverTime() - (game.incomingShot.releasedAt || serverTime()),
        ),
      );
    }
  }, [game, flight]);
  useEffect(() => {
    if (!flight || view !== "flight") return;
    const timer = setTimeout(
      () => setLanded(true),
      Math.max(
        0,
        endTime(flight.kick) - (performance.now() - flight.startedAt),
      ),
    );
    return () => clearTimeout(timer);
  }, [flight?.startedAt, view]);
  useEffect(() => {
    if (!flight || flight.shooter !== "jev" || view !== "flight" || !game)
      return;
    const timer = setTimeout(
      () => {
        setKeeperActive(false);
        void dispatch({
          action: "defend",
          matchId: game.id,
          number: flight.number,
          aim: controls.position.current,
        });
      },
      Math.max(
        0,
        impactTime(flight.kick) - (performance.now() - flight.startedAt),
      ),
    );
    return () => clearTimeout(timer);
  }, [flight?.startedAt]);
  useEffect(() => {
    if (landed && flight?.reaction) setView("result");
  }, [landed, flight?.reaction]);
  const shot = flight?.reaction;
  function start() {
    seen.current = 0;
    controls.reset();
    setKeeperActive(false);
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
  function shoot(target: Aim, kick: Kick = defaultKick) {
    if (!ready || !game || defending) return;
    const a = groundAim(target),
      trajectory = directPath(a, kick),
      number = game.attempts + 1;
    seen.current = number;
    setAim(a);
    setLanded(false);
    setView("flight");
    setFlight({
      number,
      shooter: "player",
      aim: a,
      path: trajectory,
      kick,
      startedAt: performance.now(),
      positioning: game.positioning,
    });
    void dispatch({
      action: "shoot",
      matchId: game.id,
      number,
      aim: a,
      path: trajectory,
      kick,
      releasedAt: serverTime(),
    });
  }
  async function faceJev() {
    if (!ready || !game) return;
    startingJev.current = true;
    setKeeperActive(true);
    const response = await dispatch({
      action: "ready",
      matchId: game.id,
      number: game.attempts + 1,
    });
    if (response?.attack) incoming(response.attack);
    else setKeeperActive(false);
    startingJev.current = false;
  }
  function next() {
    controls.reset();
    setFlight(null);
    setLanded(false);
    setView("aim");
  }
  const visibleShots = (game?.shots || []).filter(
    (s) => !(view === "flight" && s.number === flight?.number),
  );
  if (
    view === "result" &&
    shot &&
    !visibleShots.some((s) => s.number === shot.number)
  )
    visibleShots.push(shot);
  const goals = visibleShots.filter(
    (s) => s.shooter !== "jev" && s.outcome === "goal",
  ).length;
  const jevGoals = visibleShots.filter(
    (s) => s.shooter === "jev" && s.outcome === "goal",
  ).length;
  const winner =
    goals > jevGoals ? "You win" : goals < jevGoals ? "Jev wins" : "Draw";
  const message = completed
    ? winner.toUpperCase()
    : shot?.outcome === "goal"
      ? defending
        ? "JEV SCORES"
        : "GOAL!"
      : shot?.outcome === "saved"
        ? defending
          ? "YOU SAVED IT"
          : "SAVED"
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
        <h1 className="sr-only">Beat Jev penalty shootout</h1>
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
                  <span>:</span>
                  <strong className="jev-score">{jevGoals}</strong>
                </div>
                <div className="keeper-label">
                  <small>{defending ? "SHOOTING" : "IN GOAL"}</small>
                  <span>
                    Jev
                    <span className="kit-dot purple" />
                  </span>
                </div>
              </div>
              <div
                className="stage"
                ref={stage}
                data-turn={turn}
                data-phase={view}
                data-ready={ready && !defending}
                tabIndex={0}
                role="group"
                aria-label={
                  defending
                    ? "You are the goalkeeper. Left and Right move, hold Space to jump."
                    : "Aim on the pitch. Arrow keys move the target, Space shoots."
                }
                onKeyDown={(e) => {
                  if (!ready || defending) return;
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
                    if (!e.repeat) shoot(aim);
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
                      ready={ready && !defending}
                      flight={flight}
                      onComplete={() => setLanded(true)}
                      reducedMotion={reducedMotion}
                      defending={defending}
                      humanKeeper={controls.keeper}
                      keeperStance={
                        (
                          flight?.positioning ||
                          (game?.positioning?.number === turn
                            ? game.positioning
                            : undefined)
                        )?.x || 0
                      }
                    />
                  </Suspense>
                </SceneBoundary>
                <div className="stage-top">
                  <span className="venue">
                    {session
                      ? `ROUND ${Math.ceil(turn / 2)} / 5`
                      : "PENALTY SHOOTOUT"}
                  </span>
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
                      <span>Five kicks each. No sign-up.</span>
                    </form>
                  </div>
                )}
                {view === "result" && (
                  <div className={"result-word " + shot?.outcome} role="status">
                    {message}
                  </div>
                )}
                {countdown !== null && (
                  <div
                    className="turn-countdown"
                    role="status"
                    aria-label={`You're in goal. Jev shoots in ${countdown}`}
                  >
                    <span>YOU’RE IN GOAL</span>
                    <strong key={countdown}>{countdown}</strong>
                  </div>
                )}
                {(ready || keeperActive) && (
                  <div className="aim-hint">
                    {defending
                      ? "← → Move · Hold Space to jump"
                      : "Tap to aim · Swipe for power and curl"}
                  </div>
                )}
              </div>
              {defending && session && (
                <div
                  className="keeper-controls"
                  aria-label="Goalkeeper controls"
                >
                  <span>← → Move · Space Jump</span>
                  {[
                    ["left", "←"],
                    ["jump", "Jump"],
                    ["right", "→"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      disabled={!keeperActive && countdown === null}
                      aria-label={`Keeper ${key}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        controls.press(key, true);
                      }}
                      onPointerUp={() => controls.press(key, false)}
                      onPointerCancel={() => controls.press(key, false)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="game-controls">
                <div className="shootout-marks">
                  {(["player", "jev"] as const).map((side) => (
                    <div
                      className="shot-markers"
                      key={side}
                      aria-label={`${side === "player" ? "Your" : "Jev's"} kicks`}
                    >
                      <small>{side === "player" ? "You" : "Jev"}</small>
                      {Array.from({ length: 5 }, (_, i) => {
                        const number = i * 2 + (side === "player" ? 1 : 2),
                          s = visibleShots.find((s) => s.number === number);
                        return (
                          <span
                            key={number}
                            className={
                              s?.outcome ||
                              (number === (flight?.number || game?.turn?.number)
                                ? "current"
                                : "")
                            }
                            aria-label={`Kick ${i + 1}: ${s?.outcome || "not taken"}`}
                          >
                            {s?.outcome === "goal" ? (
                              <Check size={14} />
                            ) : s ? (
                              <X size={14} />
                            ) : (
                              i + 1
                            )}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="turn-status" aria-live="polite">
                  {!session
                    ? "Step up to the spot."
                    : game?.abandoned
                      ? "Match ended after 90 seconds without a kick."
                      : completed
                        ? `${winner}! ${goals}–${jevGoals}.`
                        : view === "result" && defending
                          ? shot?.outcome === "saved"
                            ? "You read that one."
                            : "Jev found a way through."
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
                              ? `Round ${Math.ceil(((game?.attempts || 0) + 1) / 2)} · ${defending ? "You’re in goal" : "Your kick"}`
                              : view === "flight"
                                ? landed
                                  ? "Checking the result…"
                                  : !struck
                                    ? defending
                                      ? "Jev’s run-up"
                                      : "Your run-up"
                                    : defending
                                      ? "Make the save"
                                      : "Ball in play"
                                : "Preparing the next shot…"}
                </div>
                {game?.abandoned ||
                (trace && ["failed", "canceled"].includes(trace.status)) ? (
                  <button className="primary" onClick={start}>
                    Start again
                  </button>
                ) : error ? (
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
                ) : !session ? (
                  <span className="controls-note">Score more than Jev.</span>
                ) : null}
              </div>
            </section>
            {error && (
              <p className="error" role="alert">
                {error} Your saved shots are safe.
              </p>
            )}
            <div className="game-extras">
              <div className="career">
                <span>Your record</span>
                <strong>
                  {game?.totalGoals || 0}
                  <small> goals</small>
                </strong>
                <span>{game?.totalAttempts || 0} attempts</span>
              </div>
              {!defending && (
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
              )}
            </div>
          </div>
          <div className="workflow-column">
            <WorkflowProgress game={game} session={session} trace={trace} />
            <Trace
              trace={trace}
              turn={game?.turn}
              released={
                session?.command.action === "shoot" &&
                session.command.number === game?.turn?.number
              }
              waiting={sending || (!!session && !trace)}
              shot={shot}
              positioning={
                flight?.positioning ||
                (game?.positioning?.number === turn
                  ? game.positioning
                  : undefined)
              }
            />
          </div>
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
          <h2>Five kicks each.</h2>
          <p>
            Tap to aim. A faster swipe adds power; a curved swipe adds curl. Jev
            chooses a starting position from your past kicks, then reads the
            first 160 ms of flight. It has 670 ms after contact to react. Then
            swap: Jev chooses a target. After the countdown, use Left/Right and
            Space to keep it out. Most goals wins; equal scores are a draw.
          </p>
          <ol>
            <li>
              <strong>Render Workflows</strong> saves the player, starts the
              match, runs all ten turns under one parent task, and finalizes the
              score.
            </li>
            <li>
              <strong>TypeSafe Jev</strong> chooses a save from a rough landing
              range, estimated from early ball positions. The actual target is
              hidden. When shooting, his target is committed before your current
              keeper movement. Completed turns are the only history he sees.
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
            A nickname is enough. Your record belongs to this browser. Early
            ball positions and their estimated landing range go to TypeSafe;
            your nickname is not sent. The side panel shows real task runs and
            Jev’s latest decision.
          </p>
          <a href="/credits.html" target="_blank" rel="noopener noreferrer">
            Asset credits ↗
          </a>
        </Panel>
      )}
    </div>
  );
}
