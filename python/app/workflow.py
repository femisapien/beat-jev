from render import Retry, TaskContext, Workflows
from app.store import create_match, read_match, change_match
from app.keeper import decide_keeper
from app.game import record

app = Workflows(
    default_plan="flex",
    default_timeout=60,
    default_retry=Retry(max_retries=2, wait_duration_ms=500, backoff_scaling=2),
)


@app.task
async def prepare_penalty(ctx: TaskContext, cmd: dict):
    match = await read_match(cmd["matchId"], cmd["owner"])
    state = match["state"]
    number = cmd["number"]
    if any(s["number"] == number for s in state["shots"]):
        return dict(ready=True, number=number)
    if (
        state["finished"]
        or number != sum(bool(s.get("outcome")) for s in state["shots"]) + 1
        or number > 5
    ):
        raise ValueError("Penalty out of order.")
    decision = await decide_keeper(state["shots"])

    def save(m):
        # Concurrent retries keep the first committed decision.
        if not any(s["number"] == number for s in m["state"]["shots"]):
            m["state"]["shots"].append(dict(number=number, decision=decision))

    await change_match(cmd["matchId"], cmd["owner"], save)
    return dict(ready=True, number=number)


@app.task
async def record_shot(ctx: TaskContext, cmd: dict):
    return await change_match(
        cmd["matchId"],
        cmd["owner"],
        lambda m: record(m["state"], cmd["number"], cmd["aim"]),
    )


@app.task
async def finish_game(ctx: TaskContext, cmd: dict):
    def finish(m):
        shots = m["state"]["shots"]
        if sum(bool(s.get("outcome")) for s in shots) != 5:
            raise ValueError("Match is not complete.")
        m["state"]["finished"] = True
        return dict(goals=sum(s.get("outcome") == "goal" for s in shots), attempts=5)

    return await change_match(cmd["matchId"], cmd["owner"], finish)


# A recovery run uses the same command and preserves all committed match state.
@app.task(retry=Retry(max_retries=0, wait_duration_ms=500), timeout_seconds=180)
async def start_game(ctx: TaskContext, cmd: dict):
    await create_match(cmd["matchId"], cmd["owner"], cmd["name"])
    await ctx.run(prepare_penalty, {**cmd, "number": 1})
    return dict(matchId=cmd["matchId"])


@app.task(retry=Retry(max_retries=0, wait_duration_ms=500), timeout_seconds=180)
async def take_shot(ctx: TaskContext, cmd: dict):
    shot = await ctx.run(record_shot, cmd)
    if cmd["number"] == 5:
        await ctx.run(finish_game, cmd)
    else:
        await ctx.run(
            prepare_penalty,
            dict(matchId=cmd["matchId"], owner=cmd["owner"], number=cmd["number"] + 1),
        )
    return dict(number=cmd["number"], outcome=shot["outcome"])


if __name__ == "__main__":
    app.start()
