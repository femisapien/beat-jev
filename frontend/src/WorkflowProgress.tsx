import type { Game, Trace as TraceData } from "../../shared/types";
import type { Session } from "./api";

export default function WorkflowProgress({
  game,
  session,
  trace,
}: {
  game: Game | null;
  session: Session | null;
  trace: TraceData | null;
}) {
  const isStarting = session?.command.action === "start";
  const failed = trace && ["failed", "canceled"].includes(trace.status);
  const registered = !!game;
  const began = !!game?.started;
  const stages = [
    { label: "Player", done: registered, active: !!session && !registered },
    {
      label: "Kickoff",
      done: began,
      active: !!session && registered && !began,
    },
    ...Array.from({ length: 5 }, (_, i) => ({
      label: `Penalty ${i + 1}`,
      done: (game?.attempts || 0) > i,
      active:
        !isStarting &&
        !!session &&
        session.command.number === i + 1 &&
        (game?.attempts || 0) <= i,
    })),
    {
      label: "Full time",
      done: !!game?.finished,
      active: game?.attempts === 5 && !game.finished,
    },
  ];
  return (
    <section className="match-workflow" aria-label="Match workflow">
      <ol className="match-steps">
        {stages.map((s, i) => (
          <li
            key={s.label}
            className={
              s.done ? "done" : s.active ? (failed ? "failed" : "active") : ""
            }
            aria-current={s.active ? "step" : undefined}
          >
            <span className="step-bar" />
            <span>
              <b>{i > 1 && i < 7 ? i - 1 : s.done ? "✓" : "·"}</b>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
