import asyncio
from datetime import datetime, timezone
from render import Retry, TaskContext, Workflows
from app.store import create_match, change_match
from app.keeper import decide_keeper
from app.game import record, submit, keeper_move, resolve_shot, CONFIG
from app.inputs import wait_for_input, read_input, save_reaction

app = Workflows(
    default_plan="flex",
    default_timeout=120,
    default_retry=Retry(max_retries=2, wait_duration_ms=500, backoff_scaling=2),
)


@app.task
async def register_player(ctx: TaskContext, cmd: dict):
    await create_match(cmd["matchId"], cmd["owner"], cmd["name"])
    return dict(matchId=cmd["matchId"])


@app.task
async def begin_match(ctx: TaskContext, cmd: dict):
    def begin(m):
        m["state"]["started"] = True
        return dict(ready=True)

    return await change_match(cmd["matchId"], cmd["owner"], begin)


@app.task
async def player_kick(ctx: TaskContext, cmd: dict):
    slot = await wait_for_input(cmd, "player")
    if not slot:
        return None

    def accept(m):
        shot = submit(m["state"], cmd["number"], slot["input"]["aim"])
        shot["path"] = slot["input"]["path"]
        return shot

    return await change_match(cmd["matchId"], cmd["owner"], accept)


@app.task
async def goalkeeper_action(ctx: TaskContext, cmd: dict):
    slot = await wait_for_input(cmd, "keeper")
    if not slot:
        return None
    if slot["reaction"]:
        return slot["reaction"]
    aim, path = slot["input"]["aim"], slot["input"]["path"]

    def elapsed():
        return round(
            (datetime.now(timezone.utc) - slot["released_at"]).total_seconds() * 1000
        )

    shot = dict(number=cmd["number"], aim=aim, path=path)
    remaining = CONFIG["reactionWindowMs"] - elapsed()
    try:
        if remaining <= 0:
            raise TimeoutError("Deadline passed.")
        shot["decision"] = await decide_keeper(aim, path, remaining / 1000)
        shot["reaction"] = (
            "ready" if elapsed() <= CONFIG["reactionWindowMs"] else "late"
        )
    except Exception:
        shot["reaction"] = (
            "late" if elapsed() >= CONFIG["reactionWindowMs"] - 10 else "unavailable"
        )
    shot["reactionMs"] = elapsed()
    choice = shot["decision"]["choice"] if shot["reaction"] == "ready" else "leave_wide"
    shot.update(keeper_move(aim, choice))
    shot.update(resolve_shot(aim, choice))
    return await save_reaction(str(slot["id"]), shot)


@app.task
async def record_result(ctx: TaskContext, cmd: dict):
    slot = await read_input(cmd["matchId"], cmd["number"])
    if not slot or not slot["reaction"]:
        raise ValueError("Keeper is not ready.")

    def save(m):
        shot = next(s for s in m["state"]["shots"] if s["number"] == cmd["number"])
        if not shot.get("outcome"):
            shot.update({k: v for k, v in slot["reaction"].items() if k != "outcome"})
        return record(m["state"], cmd["number"], slot["input"]["aim"])

    return await change_match(cmd["matchId"], cmd["owner"], save)


@app.task
async def finish_match(ctx: TaskContext, cmd: dict):
    def finish(m):
        shots = m["state"]["shots"]
        if sum(bool(s.get("outcome")) for s in shots) != 5:
            raise ValueError("Match is not complete.")
        m["state"]["finished"] = True
        return dict(goals=sum(s.get("outcome") == "goal" for s in shots), attempts=5)

    return await change_match(cmd["matchId"], cmd["owner"], finish)


@app.task(retry=Retry(max_retries=0, wait_duration_ms=500), timeout_seconds=180)
async def start_game(ctx: TaskContext, cmd: dict):
    await ctx.run(register_player, cmd)
    await ctx.run(begin_match, cmd)
    return dict(matchId=cmd["matchId"])


@app.task(retry=Retry(max_retries=0, wait_duration_ms=500), timeout_seconds=180)
async def take_penalty(ctx: TaskContext, cmd: dict):
    # Both tasks are running before the player releases the shot.
    kick, keeper = await asyncio.gather(
        ctx.run(player_kick, cmd), ctx.run(goalkeeper_action, cmd)
    )
    if kick is None or keeper is None:
        return dict(number=cmd["number"], expired=True)
    shot = await ctx.run(record_result, cmd)
    if cmd["number"] == 5:
        await ctx.run(finish_match, cmd)
    return dict(number=cmd["number"], outcome=shot["outcome"])


if __name__ == "__main__":
    app.start()
