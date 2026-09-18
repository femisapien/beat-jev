import json
from pathlib import Path
from datetime import datetime, timezone

CONFIG = json.loads(
    (Path(__file__).resolve().parents[2] / "shared/game.json").read_text()
)


def resolve_shot(aim, choice):
    wide = abs(aim["x"]) > 0.965 or aim["y"] < 0.035 or aim["y"] > 0.965
    keeper = {"x": 0, "y": 0.4} if wide else CONFIG["zones"][choice]
    reached = ((aim["x"] - keeper["x"]) / CONFIG["reach"]["x"]) ** 2 + (
        (aim["y"] - keeper["y"]) / CONFIG["reach"]["y"]
    ) ** 2 <= 1
    return {
        "outcome": "wide" if wide else "saved" if reached else "goal",
        "keeper": keeper,
    }


def record(state, number, aim):
    shot = next((s for s in state["shots"] if s["number"] == number), None)
    if not shot:
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
        **resolve_shot(aim, shot["decision"]["choice"]),
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
        ready=not state["finished"]
        and any(not s.get("outcome") for s in state["shots"]),
        finished=state["finished"],
        attempts=len(shots),
        goals=sum(s["outcome"] == "goal" for s in shots),
        totalAttempts=totals["attempts"],
        totalGoals=totals["goals"],
    )
