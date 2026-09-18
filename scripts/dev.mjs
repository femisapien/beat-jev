import { spawn } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
const root = resolve(import.meta.dirname, "..");
process.chdir(root);
if (existsSync(".env")) process.loadEnvFile(".env");
const language = process.argv[2] || "typescript";
if (!["typescript", "python"].includes(language))
  throw Error("Choose typescript or python.");
const py = language === "python",
  port = py ? 8131 : 8130;
process.env.RENDER_LOCAL_DEV_URL = `http://127.0.0.1:${port}`;
process.env.RENDER_WORKFLOW_SLUG = `beat-jev-${language}`;
mkdirSync("work", { recursive: true });
const log = createWriteStream(`work/dev-${language}.log`, { flags: "a" });
const children = [];
function start(label, cmd, args, cwd = root, extra = {}) {
  const p = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(p);
  for (const stream of [p.stdout, p.stderr])
    createInterface({ input: stream }).on("line", (line) => {
      const safe = `[${label}] ${line.split(" input=")[0].slice(0, 400)}`;
      log.write(safe + "\n");
      if (
        /Local:|listening on port|API ready|Uvicorn running|Error|Traceback/.test(
          line,
        )
      )
        console.log(safe);
    });
  p.on("exit", (code) => {
    if (code) console.log(label, "exited", code);
  });
}
start(
  "workflow",
  "render",
  [
    "workflows",
    "dev",
    "--port",
    String(port),
    ...(existsSync(".env") ? ["--env-file", resolve(".env")] : []),
    "--",
    ...(py
      ? [".venv/bin/python", "-m", "app.workflow"]
      : ["node_modules/.bin/tsx", "typescript/src/workflow.ts"]),
  ],
  py ? resolve("python") : root,
);
start(
  "api",
  py ? ".venv/bin/python" : "node_modules/.bin/tsx",
  py
    ? [
        "-m",
        "uvicorn",
        "app.server:app",
        "--host",
        "127.0.0.1",
        "--port",
        "3102",
        "--no-access-log",
      ]
    : ["typescript/src/server.ts"],
  py ? resolve("python") : root,
);
if (!process.env.NO_FRONTEND)
  start("web", "node_modules/.bin/vite", [], root, { VITE_EXAMPLE: language });
const stop = () => {
  for (const p of children) p.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
