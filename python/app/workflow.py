from render import Retry, TaskContext, Workflows
from app.store import create_match, read_match, change_match
from app.keeper import decide_keeper
from app.game import record, submit, keeper_move

app = Workflows(
    default_plan="flex",
    default_timeout=60,
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
    return await change_match(
        cmd["matchId"],
        cmd["owner"],
        lambda m: submit(m["state"], cmd["number"], cmd["aim"]),
    )


@app.task
async def goalkeeper_action(ctx: TaskContext, cmd: dict):
    match = await read_match(cmd["matchId"], cmd["owner"])
    shot = next(
        (s for s in match["state"]["shots"] if s["number"] == cmd["number"]), None
    )
    if not shot or not shot.get("aim"):
        raise ValueError("Penalty not submitted.")
    if shot.get("decision") and shot.get("keeper"):
        return {k: shot[k] for k in ["decision", "keeper", "keeperAction"]}
    decision = shot.get("decision") or await decide_keeper(shot["aim"])

    def save(m):
        saved = next(s for s in m["state"]["shots"] if s["number"] == cmd["number"])
        # Concurrent retries preserve the first committed response.
        saved.setdefault("decision", decision)
        saved.update(keeper_move(saved["aim"], saved["decision"]["choice"]))
        return {k: saved[k] for k in ["decision", "keeper", "keeperAction"]}

    return await change_match(cmd["matchId"], cmd["owner"], save)


@app.task
async def record_result(ctx: TaskContext, cmd: dict):
    return await change_match(
        cmd["matchId"],
        cmd["owner"],
        lambda m: record(m["state"], cmd["number"], cmd["aim"]),
    )


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
    await ctx.run(player_kick, cmd)
    await ctx.run(goalkeeper_action, cmd)
    shot = await ctx.run(record_result, cmd)
    if cmd["number"] == 5:
        await ctx.run(finish_match, cmd)
    return dict(number=cmd["number"], outcome=shot["outcome"])


if __name__ == "__main__":
    app.start()
