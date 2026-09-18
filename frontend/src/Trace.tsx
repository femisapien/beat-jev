import { useEffect, useState, useRef } from "react";
import { Check, LoaderCircle, Circle, X } from "lucide-react";
import type { Trace as TraceData, Shot, Span } from "../../shared/types";
import config from "../../shared/game.json";
const labels: Record<string, string> = {
  register_player: "Register player",
  begin_match: "Start match",
  player_kick: "Player kicks",
  goalkeeper_action: "Goalkeeper reacts",
  record_result: "Save result",
  finish_match: "Finish match",
};
const terminal = (s: string) => ["completed", "failed", "canceled"].includes(s);
const seconds = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
function TaskRow({ span, now }: { span: Span; now: number }) {
  const done = span.status === "completed",
    failed = ["failed", "canceled"].includes(span.status);
  const running = !!span.startedAt && !terminal(span.status);
  const start = Date.parse(span.startedAt || ""),
    end = Date.parse(span.completedAt || "");
  const ms = Number.isFinite(start)
    ? Math.max(0, (Number.isFinite(end) ? end : running ? now : start) - start)
    : 0;
  return (
    <li
      className={`task-row ${done ? "done" : failed ? "failed" : running ? "running" : "queued"}`}
    >
      <span className="task-icon">
        {done ? (
          <Check size={14} />
        ) : failed ? (
          <X size={14} />
        ) : running ? (
          <LoaderCircle className="spin" size={14} />
        ) : (
          <Circle size={12} />
        )}
      </span>
      <div>
        <strong>{labels[span.name] || span.name}</strong>
        <small>
          {span.status}
          {span.retries > 0 ? ` · retry ${span.retries}` : ""}
        </small>
      </div>
      <time>{ms ? seconds(ms) : "Queued"}</time>
    </li>
  );
}
export default function Trace({
  trace,
  history,
  shot,
  waiting,
}: {
  trace: TraceData | null;
  history: TraceData[];
  shot?: Shot;
  waiting?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [history.length, trace?.spans.length]);
  const running = waiting || (!!trace && !terminal(trace.status));
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);
  const active = trace?.spans.find(
    (s) => s.id !== trace.id && !terminal(s.status),
  );
  const choice = shot?.decision?.choice;
  return (
    <aside className="execution-panel" aria-label="Render workflow execution">
      <div className="execution-heading">
        <img src="/render-mark.svg" alt="" />
        <strong>Render Workflows</strong>
        <span className={running ? "status-dot running" : "status-dot"} />
      </div>
      <div className="execution-status" aria-live="polite">
        {active
          ? `${labels[active.name] || active.name}…`
          : running
            ? "Waiting for Render…"
            : trace?.status === "completed"
              ? "Run complete"
              : trace
                ? "Needs retry"
                : "Ready when you are"}
      </div>
      <div className="execution-runs" ref={list}>
        {!history.length ? (
          <div className="execution-empty">
            <Circle size={20} />
            <p>
              Enter your name and play.
              <br />
              The tasks will appear here.
            </p>
          </div>
        ) : (
          history.map((t) => {
            const root = t.spans.find((s) => s.id === t.id);
            const children = t.spans
              .filter((s) => s.id !== t.id)
              .sort(
                (a, b) =>
                  (Date.parse(a.startedAt || "") || Infinity) -
                  (Date.parse(b.startedAt || "") || Infinity),
              );
            const title =
              root?.name === "start_game"
                ? "Kickoff"
                : `Penalty ${t.number || ""}`;
            return (
              <section
                className="execution-run"
                key={t.id}
                aria-label={`${title} workflow`}
              >
                <div className="run-title">
                  <b>{title}</b>
                  <span>{t.status}</span>
                </div>
                <ol>
                  {children.map((s) => (
                    <TaskRow key={s.id} span={s} now={now} />
                  ))}
                </ol>
                {!children.length && (
                  <p className="task-wait">Waiting for the first task…</p>
                )}
                <details className="run-id">
                  <summary>Run ID</summary>
                  <code>{t.id}</code>
                  {children.map((s) => (
                    <code key={s.id}>
                      {s.name}: {s.id}
                    </code>
                  ))}
                </details>
              </section>
            );
          })
        )}
      </div>
      {shot?.decision && (
        <details className="keeper-decision">
          <summary>
            <span>
              Jev’s move{" "}
              <b>
                {choice === "leave_wide"
                  ? "Leave it"
                  : config.zones[choice as keyof typeof config.zones]?.label ||
                    choice}
              </b>
            </span>
            <small>{shot.decision.durationMs} ms</small>
          </summary>
          <div className="probabilities">
            {Object.entries(shot.decision.probabilities)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <div key={k}>
                  <span>
                    {k === "leave_wide"
                      ? "Leave it"
                      : config.zones[k as keyof typeof config.zones]?.label ||
                        k}
                  </span>
                  <meter min={0} max={1} value={v} />
                  <code>{(v * 100).toFixed(0)}%</code>
                </div>
              ))}
          </div>
          <p className="decision-note">
            Choice probabilities, not save chances.
          </p>
          <details className="decision-input">
            <summary>Inputs and response</summary>
            <pre>
              {JSON.stringify(
                {
                  question: config.question,
                  criteria: config.criteria,
                  ...shot.decision,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </details>
      )}
    </aside>
  );
}
