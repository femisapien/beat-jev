import { randomUUID } from "node:crypto";
import { pool } from "./store";
import config from "../../shared/game.json";
import type { Aim, Command, Shot } from "../../shared/types";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function prepareInput(matchId: string, number: number) {
  await pool.query(
    `INSERT INTO penalty_inputs(match_id,number,id,expires_at)
    VALUES($1,$2,$3,now()+$4*interval '1 second') ON CONFLICT(match_id,number) DO NOTHING`,
    [matchId, number, randomUUID(), config.readySeconds],
  );
  return readInput(matchId, number);
}
export async function readInput(matchId: string, number?: number) {
  return (
    await pool.query(
      "SELECT * FROM penalty_inputs WHERE match_id=$1 AND ($2::int IS NULL OR number=$2) ORDER BY number DESC LIMIT 1",
      [matchId, number ?? null],
    )
  ).rows[0];
}
export async function releaseInput(
  matchId: string,
  number: number,
  input: { aim: Aim; path: Aim[] },
  releasedAt = Date.now(),
) {
  const { rows } = await pool.query(
    `UPDATE penalty_inputs SET input=COALESCE(input,$3::jsonb), released_at=COALESCE(released_at,to_timestamp($4::double precision/1000))
    WHERE match_id=$1 AND number=$2 AND (input IS NOT NULL OR (player_ready AND keeper_ready AND expires_at>now())) RETURNING *`,
    [
      matchId,
      number,
      JSON.stringify(input),
      Math.max(Date.now() - 5000, Math.min(Date.now(), releasedAt)),
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("This turn is not ready.");
  const same = (a: Aim[], b: Aim[]) =>
    a.length === b.length &&
    a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
  if (!same([row.input.aim], [input.aim]) || !same(row.input.path, input.path))
    throw new Error("This penalty is already committed.");
  return row;
}
export async function waitForInput(cmd: Command, actor: "player" | "keeper") {
  await pool.query(
    `UPDATE penalty_inputs SET ${actor}_ready=true WHERE id=$1`,
    [cmd.inputId],
  );
  const end = Date.now() + (config.readySeconds + 5) * 1000;
  while (Date.now() < end) {
    const row = await readInput(cmd.matchId, cmd.number!);
    if (!row || row.id !== cmd.inputId) return null;
    if (row.input && row.released_at) return row;
    if (Date.now() > new Date(row.expires_at).getTime()) return null;
    await pause(50);
  }
  return null;
}
export async function saveReaction(id: string, shot: Shot) {
  return (
    await pool.query(
      "UPDATE penalty_inputs SET reaction=COALESCE(reaction,$2::jsonb) WHERE id=$1 RETURNING reaction",
      [id, JSON.stringify(shot)],
    )
  ).rows[0].reaction as Shot;
}
export async function saveAttack(id: string, shot: Shot) {
  return (
    await pool.query(
      "UPDATE penalty_inputs SET attack=COALESCE(attack,$2::jsonb) WHERE id=$1 RETURNING attack",
      [id, JSON.stringify(shot)],
    )
  ).rows[0].attack as Shot;
}
export async function saveDefense(
  matchId: string,
  number: number,
  keeper: Aim,
) {
  const { rows } = await pool.query(
    `UPDATE penalty_inputs SET defense=COALESCE(defense,$3::jsonb)
    WHERE match_id=$1 AND number=$2 AND released_at IS NOT NULL AND (defense IS NOT NULL OR (reaction IS NULL AND now()<released_at+interval '5 seconds')) RETURNING defense`,
    [matchId, number, JSON.stringify(keeper)],
  );
  if (!rows[0]) throw new Error("The save window has ended.");
  if (rows[0].defense.x !== keeper.x || rows[0].defense.y !== keeper.y)
    throw new Error("This save is already committed.");
}
export async function waitForDefense(cmd: Command) {
  for (let i = 0; i < 110; i++) {
    const row = await readInput(cmd.matchId, cmd.number!);
    if (row.defense || Date.now() > new Date(row.released_at).getTime() + 5000)
      return row;
    await pause(50);
  }
  return readInput(cmd.matchId, cmd.number!);
}
export function publicTurn(row: any) {
  if (!row) return undefined;
  const expired = Date.now() > new Date(row.expires_at).getTime();
  return {
    id: row.id,
    number: row.number,
    shooter: row.number % 2 ? ("player" as const) : ("jev" as const),
    ready:
      row.player_ready &&
      row.keeper_ready &&
      !expired &&
      !row.input &&
      (row.number % 2 === 1 || !!row.attack),
    expired,
    submitted: !!row.input,
  };
}
