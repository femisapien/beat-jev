import asyncio
from datetime import datetime, timezone
from render import Retry, TaskContext, Workflows
from app.store import create_match, change_match, read_match
from app.keeper import decide_keeper, decide_shot
from app.game import record, submit, keeper_move, resolve_shot, CONFIG
from app.flight import DEFAULT_KICK, flight_path, observe_ball
from app.inputs import (
    wait_for_input,
    read_input,
    save_reaction,
    prepare_input,
    save_attack,
    wait_for_defense,
)

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
        shot["kick"] = slot["input"].get("kick", DEFAULT_KICK)
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

    kick = slot["input"].get("kick", DEFAULT_KICK)

    def elapsed():
        return round(
            (datetime.now(timezone.utc) - slot["released_at"]).total_seconds() * 1000
        )

    shot = dict(number=cmd["number"], shooter="player", aim=aim, path=path, kick=kick)
    # Do not observe simulated frames before their release time has elapsed.
    observe_after = CONFIG["runupMs"] + CONFIG["observationMs"]
    await asyncio.sleep(max(0, observe_after - elapsed()) / 1000)
    remaining = CONFIG["reactionWindowMs"] - elapsed()
    try:
        if remaining <= 0:
            raise TimeoutError("Deadline passed.")
        shot["decision"] = await decide_keeper(observe_ball(aim, kick), remaining / 1000)
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
async def prepare_turn(ctx: TaskContext, cmd: dict):
    slot = await prepare_input(cmd["matchId"], cmd["number"])
    return dict(**cmd, inputId=str(slot["id"]))


@app.task
async def jev_kick(ctx: TaskContext, cmd: dict):
    attack = (await read_input(cmd["matchId"], cmd["number"]))["attack"]
    if not attack:
        match = await read_match(cmd["matchId"], cmd["owner"])
        decision = await decide_shot(match["state"]["shots"])
        zone = CONFIG["zones"][decision["choice"]]
        aim = dict(x=zone["x"], y=zone["y"])
        attack = await save_attack(
            cmd["inputId"],
            dict(
                number=cmd["number"],
                shooter="jev",
                aim=aim,
                decision=decision,
                kick=DEFAULT_KICK,
                path=flight_path(aim),
            ),
        )
    slot = await wait_for_input(cmd, "player")
    if not slot:
        return None

    def accept(m):
        shot = submit(m["state"], cmd["number"], attack["aim"])
        shot.update(attack)
        return shot

    return await change_match(cmd["matchId"], cmd["owner"], accept)


@app.task
async def player_save(ctx: TaskContext, cmd: dict):
    slot = await wait_for_input(cmd, "keeper")
    if not slot:
        return None
    if slot["reaction"]:
        return slot["reaction"]
    inputs = await wait_for_defense(cmd)
    keeper = inputs["defense"] or dict(x=0, y=0.25)
    shot = dict(
        **inputs["attack"],
        keeperAction="dive" if inputs["defense"] else "hold",
        reaction="ready" if inputs["defense"] else "late",
    )
    shot.update(
        resolve_shot(
            shot["aim"], "human" if inputs["defense"] else "leave_wide", keeper
        )
    )
    return await save_reaction(cmd["inputId"], shot)


@app.task
async def finish_match(ctx: TaskContext, cmd: dict):
    def finish(m):
        shots = [s for s in m["state"]["shots"] if s.get("outcome")]
        m["state"]["finished"] = len(shots) == CONFIG["shots"] * 2
        m["state"]["abandoned"] = not m["state"]["finished"]
        return dict(
            goals=sum(
                s.get("shooter") != "jev" and s["outcome"] == "goal" for s in shots
            ),
            jevGoals=sum(
                s.get("shooter") == "jev" and s["outcome"] == "goal" for s in shots
            ),
            abandoned=m["state"]["abandoned"],
        )

    return await change_match(cmd["matchId"], cmd["owner"], finish)


@app.task(retry=Retry(max_retries=0, wait_duration_ms=500), timeout_seconds=180)
async def take_penalty(ctx: TaskContext, cmd: dict):
    inputs = await ctx.run(prepare_turn, cmd)
    if cmd["number"] % 2:
        kick, keeper = await asyncio.gather(
            ctx.run(player_kick, inputs), ctx.run(goalkeeper_action, inputs)
        )
    else:
        kick, keeper = await asyncio.gather(
            ctx.run(jev_kick, inputs), ctx.run(player_save, inputs)
        )
    if kick is None or keeper is None:
        return dict(expired=True)
    await ctx.run(record_result, cmd)
    return dict(expired=False)


@app.task(retry=Retry(max_retries=0, wait_duration_ms=500), timeout_seconds=1200)
async def run_game(ctx: TaskContext, cmd: dict):
    await ctx.run(register_player, cmd)
    await ctx.run(begin_match, cmd)
    for number in range(1, CONFIG["shots"] * 2 + 1):
        turn = await ctx.run(take_penalty, dict(**cmd, number=number))
        if turn["expired"]:
            break
    return await ctx.run(finish_match, cmd)


if __name__ == "__main__":
    app.start()
