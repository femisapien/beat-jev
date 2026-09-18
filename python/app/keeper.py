from time import perf_counter
from typesafe_sdk import AsyncTypeSafeClient, Choice, RetryPolicy
from app.game import CONFIG


async def decide_keeper(shots):
    history = [
        dict(aim=s["aim"], outcome=s["outcome"]) for s in shots if s.get("outcome")
    ]
    options = {k: v["label"] for k, v in CONFIG["zones"].items()}
    started = perf_counter()
    async with AsyncTypeSafeClient(
        retry=RetryPolicy(max_retries=0, timeout=10)
    ) as client:
        result = await client.system_one(
            state=dict(history=history),
            questions={
                "defend": Choice(instructions=CONFIG["question"], criteria=options)
            },
        )
    answer = result.choices["defend"]
    if answer.choice not in options:
        raise ValueError("Keeper decision unavailable.")
    return dict(
        choice=answer.choice,
        probabilities=answer.probabilities,
        confidence=answer.confidence,
        model=result.model,
        durationMs=round((perf_counter() - started) * 1000),
        history=history,
    )
