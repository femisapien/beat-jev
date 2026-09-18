import json
from pathlib import Path
from datetime import datetime, timezone

CONFIG = json.loads(
    (Path(__file__).resolve().parents[2] / "shared/game.json").read_text()
)


def keeper_move(aim, choice):
    hold = (
        abs(aim["x"]) > 0.965
        or aim["y"] < 0.035
        or aim["y"] > 0.965
        or choice == "leave_wide"
    )
    return dict(
        keeper={"x": 0, "y": 0.4} if hold else CONFIG["zones"][choice],
        keeperAction="hold" if hold else "dive",
    )


def resolve_shot(aim, choice, keeper=None):
    wide = abs(aim["x"]) > 0.965 or aim["y"] < 0.035 or aim["y"] > 0.965
    keeper = keeper or keeper_move(aim, choice)["keeper"]
    reached = ((aim["x"] - keeper["x"]) / CONFIG["reach"]["x"]) ** 2 + (
        (aim["y"] - keeper["y"]) / CONFIG["reach"]["y"]
    ) ** 2 <= 1
    return {
        "outcome": "wide"
        if wide
        else "saved"
        if reached and choice != "leave_wide"
        else "goal",
        "keeper": keeper,
    }


def record(state, number, aim):
    shot = next((s for s in state["shots"] if s["number"] == number), None)
    if (
        not shot
        or (not shot.get("decision") and not shot.get("reaction"))
        or not shot.get("keeper")
    ):
        raise ValueError("Keeper is not ready.")
    if shot.get("outcome"):
        if shot["aim"] != aim:
            raise ValueError("This penalty is already committed.")
        return shot
    if (
        state["finished"]
        or number != sum(bool(s.get("outcome")) for s in state["shots"]) + 1
        or number > 5
    ):
        raise ValueError("Penalty out of order.")
    shot.update(
        aim=aim,
        **resolve_shot(
            aim,
            "leave_wide"
            if shot.get("reaction") in ["late", "unavailable"]
            else shot["decision"]["choice"],
            shot["keeper"],
        ),
        committedAt=datetime.now(timezone.utc).isoformat(),
    )
    return shot


def public_game(match, totals):
    state = match["state"]
    shots = [s for s in state["shots"] if s.get("outcome")]
    return dict(
        id=str(match["id"]),
        name=match["name"],
        shots=shots,
        started=bool(state.get("started")),
        ready=bool(state.get("started"))
        and not state["finished"]
        and len(shots) < 5
        and not any(not s.get("outcome") for s in state["shots"]),
        finished=state["finished"],
        attempts=len(shots),
        goals=sum(s["outcome"] == "goal" for s in shots),
        totalAttempts=totals["attempts"],
        totalGoals=totals["goals"],
    )


def submit(state, number, aim):
    existing = next((s for s in state["shots"] if s["number"] == number), None)
    if existing:
        if existing.get("aim") != aim:
            raise ValueError("This penalty is already committed.")
        return existing
    if (
        not state.get("started")
        or state["finished"]
        or number != sum(bool(s.get("outcome")) for s in state["shots"]) + 1
        or number > 5
    ):
        raise ValueError("Penalty out of order.")
    shot = dict(number=number, aim=aim)
    state["shots"].append(shot)
    return shot
