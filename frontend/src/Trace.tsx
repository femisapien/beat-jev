import { useEffect, useState, useRef } from "react";
import { Check, LoaderCircle, Circle, X } from "lucide-react";
import type { Trace as TraceData, Shot, Span, Turn } from "../../shared/types";
import config from "../../shared/game.json";
const labels: Record<string, string> = {
  prepare_turn: "Prepare turn",
  jev_kick: "Jev’s kick",
  player_save: "Your save",
  register_player: "Register player",
  begin_match: "Start match",
  player_kick: "Player input",
  goalkeeper_action: "Jev decision",
  record_result: "Save result",
  finish_match: "Finish match",
};
const terminal = (s: string) => ["completed", "failed", "canceled"].includes(s);
const seconds = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
function TaskRow({
  span,
  now,
  waiting,
}: {
  span: Span;
  now: number;
  waiting?: boolean;
}) {
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
          {waiting && running ? "Awaiting input · running" : span.status}
          {span.retries > 0 ? ` · retry ${span.retries}` : ""}
        </small>
      </div>
      <time title="Task runtime, including time waiting for input">
        {ms ? seconds(ms) : "Queued"}
      </time>
    </li>
  );
}
export default function Trace({
  trace,
  shot,
  waiting,
  turn,
  released,
}: {
  trace: TraceData | null;
  shot?: Shot;
  waiting?: boolean;
  turn?: Turn;
  released?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const list = useRef<HTMLDivElement>(null);
  const running = waiting || (!!trace && !terminal(trace.status));
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => {
    const panel = list.current,
      item = panel?.querySelector(".current-turn");
    if (panel && item) {
      const p = panel.getBoundingClientRect(),
        r = item.getBoundingClientRect();
      if (r.bottom > p.bottom || r.top < p.top)
        panel.scrollTo({
          top: panel.scrollTop + r.top - p.top,
          behavior: "smooth",
        });
    }
  }, [turn?.number, trace?.spans.length]);
  const spans = trace?.spans || [];
  const active = spans.filter(
    (s) =>
      !["run_game", "take_penalty"].includes(s.name) && !terminal(s.status),
  );
  const choice = shot?.decision?.choice;
  const row = (s: Span) => (
    <TaskRow
      key={s.id}
      span={s}
      now={now}
      waiting={
        turn?.number === s.number &&
        !turn?.submitted &&
        ["player_kick", "goalkeeper_action", "player_save"].includes(s.name)
      }
    />
  );
  return (
    <aside className="execution-panel" aria-label="Render workflow execution">
      <div className="execution-heading">
        <img src="/render-mark.svg" alt="" />
        <strong>Render Workflows</strong>
        <span className={running ? "status-dot running" : "status-dot"} />
      </div>
      <div className="execution-status" aria-live="polite">
        {turn?.ready
          ? released
            ? "Sending your shot…"
            : `Ready · ${turn.shooter === "jev" ? "you’re in goal" : "your kick"}`
          : active.length > 1
            ? `${active.length} tasks running in parallel`
            : active.length
              ? `${labels[active[0].name] || active[0].name}…`
              : trace?.status === "completed"
                ? "Match run complete"
                : running
                  ? "Starting match…"
                  : "One match. One task tree."}
      </div>
      {trace && (
        <details className="match-run-id">
          <summary>Match run · {trace.status}</summary>
          <code>{trace.id}</code>
        </details>
      )}
      <div className="execution-runs" ref={list}>
        {!trace ? (
          <div className="execution-empty">
            <Circle size={20} />
            <p>The match and its tasks appear here.</p>
          </div>
        ) : (
          <>
            <section className="execution-run">
              <div className="run-title">
                <b>Kickoff</b>
              </div>
              <ol>
                {spans
                  .filter((s) =>
                    ["register_player", "begin_match"].includes(s.name),
                  )
                  .map(row)}
              </ol>
            </section>
            {spans
              .filter((s) => s.name === "take_penalty")
              .sort((a, b) => a.number! - b.number!)
              .map((parent) => {
                const current = parent.number === turn?.number;
                const children = spans
                  .filter((s) => s.parentId === parent.id)
                  .sort(
                    (a, b) =>
                      (Date.parse(a.startedAt || "") || Infinity) -
                      (Date.parse(b.startedAt || "") || Infinity),
                  );
                return (
                  <details
                    key={parent.id}
                    className={`execution-run ${current ? "current-turn" : ""}`}
                    open={current || !terminal(parent.status)}
                  >
                    <summary className="run-title">
                      <b>
                        Round {Math.ceil(parent.number! / 2)} ·{" "}
                        {parent.number! % 2 ? "Your kick" : "Jev’s kick"}
                      </b>
                      <span>
                        {parent.status === "paused" ? "Running" : parent.status}
                      </span>
                    </summary>
                    <ol>{children.map(row)}</ol>
                    <details className="run-id">
                      <summary>Task IDs</summary>
                      <code>{parent.id}</code>
                      {children.map((s) => (
                        <code key={s.id}>
                          {s.name}: {s.id}
                        </code>
                      ))}
                    </details>
                  </details>
                );
              })}
            {spans.some((s) => s.name === "finish_match") && (
              <section className="execution-run">
                <ol>
                  {spans.filter((s) => s.name === "finish_match").map(row)}
                </ol>
              </section>
            )}
          </>
        )}
      </div>
      {shot?.reaction && shot.shooter !== "jev" && (
        <div className="reaction-window">
          <span>
            Jev{" "}
            {shot.reaction === "ready"
              ? "responded"
              : shot.reaction === "late"
                ? "could not react in time"
                : "was unavailable"}
          </span>
          <strong>
            {shot.reactionMs} / {config.reactionWindowMs} ms
          </strong>
        </div>
      )}
      {shot?.decision && (
        <details className="keeper-decision">
          <summary>
            <span>
              {shot.shooter === "jev" ? "Jev’s shot" : "Jev’s save"}{" "}
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
                  question:
                    shot.shooter === "jev"
                      ? config.shootQuestion
                      : config.question,
                  criteria:
                    shot.shooter === "jev"
                      ? config.shootCriteria
                      : config.criteria,
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
