import { useEffect, useState } from "react";
import type { Trace as TraceData, Shot } from "../../shared/types";
import config from "../../shared/game.json";
const labels: Record<string, string> = {
  start_game: "Start match",
  prepare_penalty: "Jev chooses a move",
  take_shot: "Play penalty",
  record_shot: "Record shot",
  finish_game: "Finish match",
};
const terminal = (s: string) => ["completed", "failed", "canceled"].includes(s);
export default function Trace({
  trace,
  shot,
}: {
  trace: TraceData | null;
  shot?: Shot;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!trace || terminal(trace.status)) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [trace?.status]);
  const start = Math.min(
    ...(trace?.spans || [])
      .map((s) => Date.parse(s.startedAt || ""))
      .filter(Number.isFinite),
  );
  const end = Math.max(
    trace && terminal(trace.status) ? start : now,
    ...(trace?.spans || [])
      .map((s) => Date.parse(s.completedAt || ""))
      .filter(Number.isFinite),
  );
  const width = Math.max(10, Math.ceil((end - start) / 10000) * 10);
  return (
    <details className="trace">
      <summary>
        <span className="workflow-label">
          <img src="/render-mark.svg" alt="" />
          Render Workflows
        </span>
        <span>
          {trace
            ? terminal(trace.status)
              ? trace.status === "completed"
                ? "Complete"
                : "Needs retry"
              : "Running"
            : "Every penalty runs as a workflow"}{" "}
          <span className="plus">+</span>
        </span>
      </summary>
      <div className="trace-content">
        {trace ? (
          <>
            <div className="trace-heading">
              <span>Actual task runs</span>
              <code>{trace.id}</code>
            </div>
            <div className="spans">
              {trace.spans.map((s) => {
                const begin = Date.parse(s.startedAt || "");
                const finish = Date.parse(s.completedAt || "");
                const duration = Number.isFinite(begin)
                  ? Math.max(
                      0,
                      (Number.isFinite(finish)
                        ? finish
                        : terminal(s.status)
                          ? begin
                          : now) - begin,
                    )
                  : 0;
                return (
                  <div className="span" key={s.id}>
                    <div>
                      <strong>{labels[s.name] || s.name}</strong>
                      <small>
                        {s.status}
                        {s.retries > 0 ? ` · retry ${s.retries}` : ""}
                      </small>
                    </div>
                    <div className="span-track">
                      <i
                        className={
                          s.name === "prepare_penalty"
                            ? "jev"
                            : s.name === "record_shot"
                              ? "db"
                              : ""
                        }
                        style={{
                          left: Number.isFinite(begin)
                            ? `${((begin - start) / 1000 / width) * 100}%`
                            : 0,
                          width: `${Math.max(0.6, (duration / 1000 / width) * 100)}%`,
                        }}
                      />
                    </div>
                    <code>
                      {duration ? (duration / 1000).toFixed(1) + "s" : "Queued"}
                    </code>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p>
            Start match → prepare keeper → record shot → prepare next penalty.
            All match changes run on Render.
          </p>
        )}
        {shot && (
          <div className="decision">
            <div className="trace-heading">
              <strong>Jev’s decision · penalty {shot.number}</strong>
              <span>{shot.decision.durationMs} ms</span>
            </div>
            <p>
              {shot.outcome === "wide"
                ? "Your shot went wide. Game rules kept Jev standing."
                : `Jev defended ${config.zones[shot.decision.choice as keyof typeof config.zones].label.toLowerCase()}.`}
            </p>
            <div className="probabilities">
              {Object.entries(shot.decision.probabilities)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <div key={k}>
                    <span>
                      {config.zones[k as keyof typeof config.zones]?.label || k}
                    </span>
                    <meter min={0} max={1} value={v} />
                    <code>{(v * 100).toFixed(0)}%</code>
                  </div>
                ))}
            </div>
            <small>
              Decision probabilities, not save chances. Jev saw{" "}
              {shot.decision.history.length} previous shots. Your target was
              hidden.
            </small>
            <details>
              <summary>Inputs and response</summary>
              <pre>
                {JSON.stringify(
                  { question: config.question, ...shot.decision },
                  null,
                  2,
                )}
              </pre>
            </details>
          </div>
        )}
      </div>
    </details>
  );
}
