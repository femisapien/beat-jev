import express from "express";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { migrate, readMatch, totals } from "./store";
import { publicGame } from "./game";
import { readTrace, render, workflow } from "./runs";
import { prepareInput, releaseInput, readInput, publicTurn } from "./inputs";
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "4kb" }));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const owner = (req: express.Request) => {
  const token = req.header("authorization")?.replace(/^Bearer /, "");
  if (!token || !uuid.test(token)) throw new Error("Invalid player session.");
  return createHash("sha256").update(token).digest("hex");
};
const limits = new Map<string, { count: number; until: number }>();
app.get("/api/health", (_q, s) =>
  s.json({ language: "typescript", game: "beat-jev" }),
);
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    res.locals.owner = owner(req);
  } catch {
    return res.status(401).json({ error: "Player session required." });
  }
  if (req.method === "POST") {
    const key = req.ip || "unknown",
      now = Date.now();
    if (limits.size > 2000)
      for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    const limit = limits.get(key);
    if (limit && limit.until > now) {
      if (limit.count++ >= 45)
        return res
          .status(429)
          .json({ error: "Take a short break, then retry." });
    } else limits.set(key, { count: 1, until: now + 60000 });
  }
  next();
});
app.post("/api/play", async (req, res) => {
  try {
    const b = req.body;
    if (
      !b ||
      !uuid.test(b.matchId) ||
      !["start", "arm", "shoot"].includes(b.action) ||
      Object.keys(b).some(
        (k) =>
          ![
            "action",
            "matchId",
            "name",
            "number",
            "aim",
            "path",
            "releasedAt",
          ].includes(k),
      )
    )
      return res.status(400).json({ error: "Invalid game action." });
    const cmd: any = { matchId: b.matchId, owner: res.locals.owner };
    if (b.action === "start") {
      if (
        typeof b.name !== "string" ||
        !b.name.trim() ||
        b.name.trim().length > 24
      )
        return res
          .status(400)
          .json({ error: "Use a name between 1 and 24 characters." });
      cmd.name = b.name.trim();
    } else {
      if (!Number.isInteger(b.number) || b.number < 1 || b.number > 5)
        return res.status(400).json({ error: "Invalid penalty." });
      const match = await readMatch(b.matchId, cmd.owner);
      const existing = match.state.shots.find((s) => s.number === b.number);
      if (
        !existing &&
        (!match.state.started ||
          match.state.finished ||
          b.number !== match.state.shots.filter((s) => s.outcome).length + 1)
      )
        return res
          .status(409)
          .json({ error: "That penalty is not available." });
      cmd.number = b.number;
      if (b.action === "arm") {
        if (existing?.outcome)
          return res.status(409).json({ error: "Penalty already finished." });
        cmd.inputId = (await prepareInput(b.matchId, b.number)).id;
      } else {
        const point = (p: any, x: number, y: number) =>
          p &&
          Object.keys(p).sort().join() === "x,y" &&
          [p.x, p.y].every(Number.isFinite) &&
          Math.abs(p.x) <= x &&
          p.y >= 0.035 &&
          p.y <= y;
        const path = b.path || [{ x: 0, y: 0.06 }, b.aim];
        if (
          !point(b.aim, 1.6, 1.5) ||
          !Array.isArray(path) ||
          path.length < 2 ||
          path.length > 32 ||
          !path.every((p) => point(p, 4, 5)) ||
          path.at(-1).x !== b.aim.x ||
          path.at(-1).y !== b.aim.y
        )
          return res.status(400).json({ error: "Invalid shot path." });
        try {
          await releaseInput(
            b.matchId,
            b.number,
            { aim: b.aim, path },
            Number.isFinite(b.releasedAt) ? b.releasedAt : Date.now(),
          );
          return res.status(202).json({ released: true });
        } catch (e) {
          return res.status(409).json({ error: (e as Error).message });
        }
      }
    }
    const run = await render.workflows.startTask(
      `${workflow}/${b.action === "start" ? "start_game" : "take_penalty"}`,
      [cmd],
    );
    res.status(202).json({ runId: run.taskRunId });
  } catch (e) {
    res
      .status(503)
      .json({ error: "Could not start the task. Retry the same action." });
  }
});
app.get("/api/matches/:id", async (req, res) => {
  if (!uuid.test(req.params.id))
    return res.status(404).json({ error: "Match not found." });
  try {
    const match = await readMatch(req.params.id, res.locals.owner);
    const [counts, slot] = await Promise.all([
      totals(res.locals.owner),
      readInput(req.params.id),
    ]);
    res.json({
      ...publicGame(match, counts),
      turn: publicTurn(slot),
      activeShot: slot?.reaction || undefined,
      serverNow: Date.now(),
    });
  } catch {
    res.status(404).json({ error: "Match not found." });
  }
});
app.get("/api/runs/:id", async (req, res) => {
  if (!/^trn-[a-z0-9]+$/.test(req.params.id))
    return res.status(404).json({ error: "Trace not found." });
  try {
    res.json(await readTrace(req.params.id, res.locals.owner));
  } catch {
    res.status(404).json({ error: "Trace not found." });
  }
});
app.use(express.static(resolve("dist/typescript")));
app.get("/{*path}", (_q, res) =>
  res.sendFile(resolve("dist/typescript/index.html")),
);
app.use(
  (
    err: Error,
    _q: express.Request,
    res: express.Response,
    _n: express.NextFunction,
  ) => res.status(400).json({ error: "Invalid request." }),
);
await migrate();
app.listen(
  Number(process.env.PORT || 3101),
  process.env.HOST || "127.0.0.1",
  () => console.log("API ready on port " + (process.env.PORT || 3101)),
);
