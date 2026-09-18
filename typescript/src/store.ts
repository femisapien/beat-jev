import pg from "pg";
import { readFileSync } from "node:fs";
import type { Match } from "../../shared/types";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 1000,
});
export async function migrate() {
  await pool.query(
    readFileSync(new URL("../../database/schema.sql", import.meta.url), "utf8"),
  );
}
export async function createMatch(id: string, owner: string, name: string) {
  await pool.query(
    "INSERT INTO matches(id,owner_hash,name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
    [id, owner, name],
  );
  return readMatch(id, owner);
}
export async function readMatch(id: string, owner: string): Promise<Match> {
  const { rows } = await pool.query(
    "SELECT * FROM matches WHERE id=$1 AND owner_hash=$2",
    [id, owner],
  );
  if (!rows[0]) throw new Error("Match not found.");
  return rows[0];
}
export async function changeMatch<T>(
  id: string,
  owner: string,
  change: (m: Match) => T,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query(
      "SELECT * FROM matches WHERE id=$1 AND owner_hash=$2 FOR UPDATE",
      [id, owner],
    );
    if (!rows[0]) throw new Error("Match not found.");
    const result = change(rows[0]);
    await c.query("UPDATE matches SET state=$2::jsonb WHERE id=$1", [
      id,
      JSON.stringify(rows[0].state),
    ]);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function totals(owner: string) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS attempts, count(*) FILTER (WHERE shot->>'outcome'='goal')::int AS goals FROM matches, jsonb_array_elements(state->'shots') shot WHERE owner_hash=$1 AND shot ? 'outcome'`,
    [owner],
  );
  return rows[0];
}
