from time import perf_counter
from typesafe_sdk import AsyncTypeSafeClient, Choice, RetryPolicy
from app.game import CONFIG


async def decide_keeper(aim, path=None, timeout=10):
    state = dict(
        ball=dict(
            projectedCrossing=aim,
            trajectory=path or [],
            horizontal="left"
            if aim["x"] < -0.31
            else "right"
            if aim["x"] > 0.31
            else "center",
            height="low" if aim["y"] < 0.505 else "high",
            path="outside the goal"
            if abs(aim["x"]) > 0.965 or aim["y"] < 0.035 or aim["y"] > 0.965
            else "on target",
        ),
        coordinates="Shooter view: x=-1 left post, x=0 center, x=1 right post. y=0 grass, y=1 crossbar. The crossing is computed by the game, not inferred from an image.",
    )
    started = perf_counter()
    async with AsyncTypeSafeClient(
        retry=RetryPolicy(max_retries=0, timeout=timeout)
    ) as client:
        result = await client.system_one(
            state=state,
            questions={
                "defend": Choice(
                    instructions=CONFIG["question"], criteria=CONFIG["criteria"]
                )
            },
        )
    answer = result.choices["defend"]
    if answer.choice not in CONFIG["criteria"]:
        raise ValueError("Keeper decision unavailable.")
    return dict(
        choice=answer.choice,
        probabilities=answer.probabilities,
        confidence=answer.confidence,
        model=result.model,
        durationMs=round((perf_counter() - started) * 1000),
        state=state,
    )
