import os
from pathlib import Path
from psycopg import AsyncConnection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def connection():
    return AsyncConnection.connect(
        os.environ["DATABASE_URL"], row_factory=dict_row, connect_timeout=5
    )


async def migrate():
    async with await connection() as conn:
        await conn.execute(
            (Path(__file__).resolve().parents[2] / "database/schema.sql").read_text()
        )


async def create_match(match_id, owner, name):
    async with await connection() as conn:
        await conn.execute(
            "INSERT INTO matches(id,owner_hash,name) VALUES(%s,%s,%s) ON CONFLICT(id) DO NOTHING",
            (match_id, owner, name),
        )
    return await read_match(match_id, owner)


async def read_match(match_id, owner):
    async with await connection() as conn:
        row = await (
            await conn.execute(
                "SELECT * FROM matches WHERE id=%s AND owner_hash=%s", (match_id, owner)
            )
        ).fetchone()
        if not row:
            raise LookupError("Match not found.")
        return row


async def change_match(match_id, owner, change):
    async with await connection() as conn:
        row = await (
            await conn.execute(
                "SELECT * FROM matches WHERE id=%s AND owner_hash=%s FOR UPDATE",
                (match_id, owner),
            )
        ).fetchone()
        if not row:
            raise LookupError("Match not found.")
        result = change(row)
        await conn.execute(
            "UPDATE matches SET state=%s WHERE id=%s", (Jsonb(row["state"]), match_id)
        )
        return result


async def totals(owner):
    async with await connection() as conn:
        return await (
            await conn.execute(
                "SELECT count(*)::int AS attempts, count(*) FILTER (WHERE shot->>'outcome'='goal')::int AS goals FROM matches, jsonb_array_elements(state->'shots') shot WHERE owner_hash=%s AND shot ? 'outcome'",
                (owner,),
            )
        ).fetchone()
