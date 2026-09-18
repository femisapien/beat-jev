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
      label: `Round ${i + 1}`,
      done: (game?.attempts || 0) >= (i + 1) * 2,
      active:
        !!game?.turn &&
        Math.ceil(game.turn.number / 2) === i + 1 &&
        (game.attempts || 0) < (i + 1) * 2,
    })),
    {
      label: "Full time",
      done: !!game?.finished,
      active: game?.attempts === 10 && !game.finished,
    },
  ];
  return (
    <section className="match-workflow" aria-label="Match workflow">
      <ol className="match-steps">
        {stages.map((s, i) => (
          <li
            key={s.label}
            aria-label={s.label}
            className={
              s.done ? "done" : s.active ? (failed ? "failed" : "active") : ""
            }
            aria-current={s.active ? "step" : undefined}
          >
            <span className="step-bar" />
            <span aria-hidden="true">
              {i > 1 && i < 7
                ? i - 1
                : i === 1
                  ? "Start"
                  : i === 7
                    ? "End"
                    : s.label}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
