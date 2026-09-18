import express from "express";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { migrate, readMatch, totals } from "./store";
import { publicGame } from "./game";
import { readTrace, render, workflow } from "./runs";
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
      !["start", "shoot"].includes(b.action) ||
      Object.keys(b).some(
        (k) => !["action", "matchId", "name", "number", "aim"].includes(k),
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
      if (
        !Number.isInteger(b.number) ||
        b.number < 1 ||
        b.number > 5 ||
        !b.aim ||
        Object.keys(b.aim).sort().join() !== "x,y" ||
        ![b.aim.x, b.aim.y].every(
          (v) => typeof v === "number" && Number.isFinite(v),
        ) ||
        Math.abs(b.aim.x) > 1.6 ||
        b.aim.y < -0.4 ||
        b.aim.y > 1.5
      )
        return res.status(400).json({ error: "Invalid penalty." });
      const match = await readMatch(b.matchId, cmd.owner);
      const shot = match.state.shots.find((s) => s.number === b.number);
      if (
        !shot ||
        (shot.aim && (shot.aim.x !== b.aim.x || shot.aim.y !== b.aim.y))
      )
        return res
          .status(409)
          .json({ error: "That penalty is not available." });
      cmd.number = b.number;
      cmd.aim = b.aim;
    }
    const run = await render.workflows.startTask(
      `${workflow}/${b.action === "start" ? "start_game" : "take_shot"}`,
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
    res.json(publicGame(match, await totals(res.locals.owner)));
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
