import { spawnSync } from "node:child_process";
for (const MOBILE of ["0", "1"]) {
  const result = spawnSync(process.execPath, ["tests/interaction.mjs"], {
    stdio: "inherit",
    env: { ...process.env, MOBILE },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
