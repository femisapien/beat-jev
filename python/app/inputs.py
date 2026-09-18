import asyncio
import time
from uuid import uuid4
from datetime import datetime, timezone
from psycopg.types.json import Jsonb
from app.store import connection
from app.game import CONFIG


async def prepare_input(match_id, number):
    async with connection() as conn:
        return await (
            await conn.execute(
                """INSERT INTO penalty_inputs(match_id,number,id,expires_at)
            VALUES(%s,%s,%s,now()+%s*interval '1 second') ON CONFLICT(match_id,number) DO UPDATE SET match_id=EXCLUDED.match_id RETURNING *""",
                (match_id, number, str(uuid4()), CONFIG["readySeconds"]),
            )
        ).fetchone()


async def read_input(match_id, number=None, conn=None):
    if conn is None:
        async with connection() as db:
            return await read_input(match_id, number, db)
    return await (
        await conn.execute(
            "SELECT * FROM penalty_inputs WHERE match_id=%s AND (%s::int IS NULL OR number=%s) ORDER BY number DESC LIMIT 1",
            (match_id, number, number),
        )
    ).fetchone()


async def release_input(match_id, number, data, released_at=None):
    async with connection() as conn:
        row = await (
            await conn.execute(
                """UPDATE penalty_inputs SET input=COALESCE(input,%s), released_at=COALESCE(released_at,to_timestamp(%s::double precision/1000))
          WHERE match_id=%s AND number=%s AND (input IS NOT NULL OR (player_ready AND keeper_ready AND expires_at>now())) RETURNING *""",
                (
                    Jsonb(data),
                    max(
                        time.time() * 1000 - 5000,
                        min(time.time() * 1000, released_at or time.time() * 1000),
                    ),
                    match_id,
                    number,
                ),
            )
        ).fetchone()
        if not row:
            raise ValueError("The keeper is not ready. Prepare the penalty again.")
        if row["input"] != data:
            raise ValueError("This penalty is already committed.")
        return row


async def wait_for_input(cmd, actor):
    async with connection() as conn:
        await conn.set_autocommit(True)
        await conn.execute(
            f"UPDATE penalty_inputs SET {actor}_ready=true WHERE id=%s",
            (cmd["inputId"],),
        )
        end = asyncio.get_running_loop().time() + CONFIG["readySeconds"] + 5
        while asyncio.get_running_loop().time() < end:
            row = await read_input(cmd["matchId"], cmd["number"], conn)
            if not row or str(row["id"]) != cmd["inputId"]:
                return None
            if row["input"] and row["released_at"]:
                return row
            if datetime.now(timezone.utc) > row["expires_at"]:
                return None
            await asyncio.sleep(0.05)
    return None


async def save_reaction(input_id, shot):
    async with connection() as conn:
        row = await (
            await conn.execute(
                "UPDATE penalty_inputs SET reaction=COALESCE(reaction,%s) WHERE id=%s RETURNING reaction",
                (Jsonb(shot), input_id),
            )
        ).fetchone()
        return row["reaction"]


def public_turn(row):
    if not row:
        return None
    expired = datetime.now(timezone.utc) > row["expires_at"]
    return dict(
        id=str(row["id"]),
        number=row["number"],
        ready=row["player_ready"]
        and row["keeper_ready"]
        and not expired
        and not row["input"]
        and (row["number"] % 2 == 1 or bool(row["attack"])),
        expired=expired,
        submitted=bool(row["input"]),
        shooter="player" if row["number"] % 2 else "jev",
    )


async def save_attack(input_id, shot):
    async with connection() as conn:
        row = await (
            await conn.execute(
                "UPDATE penalty_inputs SET attack=COALESCE(attack,%s) WHERE id=%s RETURNING attack",
                (Jsonb(shot), input_id),
            )
        ).fetchone()
        return row["attack"]


async def save_defense(match_id, number, keeper):
    async with connection() as conn:
        row = await (
            await conn.execute(
                """UPDATE penalty_inputs SET defense=COALESCE(defense,%s)
            WHERE match_id=%s AND number=%s AND released_at IS NOT NULL AND (defense IS NOT NULL OR (reaction IS NULL AND now()<released_at+interval '5 seconds')) RETURNING defense""",
                (Jsonb(keeper), match_id, number),
            )
        ).fetchone()
        if not row:
            raise ValueError("The save window has ended.")
        if row["defense"] != keeper:
            raise ValueError("This save is already committed.")


async def wait_for_defense(cmd):
    for _ in range(110):
        row = await read_input(cmd["matchId"], cmd["number"])
        if (
            row["defense"]
            or (datetime.now(timezone.utc) - row["released_at"]).total_seconds() > 5
        ):
            return row
        await asyncio.sleep(0.05)
    return await read_input(cmd["matchId"], cmd["number"])
