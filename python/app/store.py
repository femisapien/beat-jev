import os
from pathlib import Path
from contextlib import asynccontextmanager
from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


async def reset(conn):
    await conn.set_autocommit(False)


pool = AsyncConnectionPool(
    os.environ["DATABASE_URL"],
    min_size=0,
    max_size=3,
    max_idle=30,
    kwargs=dict(row_factory=dict_row, connect_timeout=5),
    reset=reset,
    open=False,
)


@asynccontextmanager
async def connection():
    await pool.open()
    async with pool.connection() as conn:
        yield conn


async def migrate():
    async with connection() as conn:
        await conn.execute(
            (Path(__file__).resolve().parents[2] / "database/schema.sql").read_text()
        )


async def create_match(match_id, owner, name):
    async with connection() as conn:
        await conn.execute(
            "INSERT INTO matches(id,owner_hash,name) VALUES(%s,%s,%s) ON CONFLICT(id) DO NOTHING",
            (match_id, owner, name),
        )
    return await read_match(match_id, owner)


async def read_match(match_id, owner):
    async with connection() as conn:
        row = await (
            await conn.execute(
                "SELECT * FROM matches WHERE id=%s AND owner_hash=%s", (match_id, owner)
            )
        ).fetchone()
        if not row:
            raise LookupError("Match not found.")
        return row


async def change_match(match_id, owner, change):
    async with connection() as conn:
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
    async with connection() as conn:
        return await (
            await conn.execute(
                "SELECT count(*)::int AS attempts, count(*) FILTER (WHERE shot->>'outcome'='goal')::int AS goals FROM matches, jsonb_array_elements(state->'shots') shot WHERE owner_hash=%s AND shot ? 'outcome'",
                (owner,),
            )
        ).fetchone()
