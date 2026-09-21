from app.game import CONFIG

DEFAULT_KICK = dict(power=0.6, curl=0)


def flight_ms(kick):
    return 1450 - 250 * kick["power"]


def impact_time(kick):
    return CONFIG["runupMs"] + flight_ms(kick)


def ball_at(aim, kick, progress):
    t = max(0, min(1, progress))
    seconds = flight_ms(kick) / 1000
    return dict(
        x=aim["x"] * 3.66 * t + kick["curl"] * 0.65 * 4 * t * (1 - t),
        y=(
            0.1464
            + (aim["y"] * 2.44 - 0.1464) * t
            + 0.5 * 9.81 * seconds**2 * t * (1 - t)
        ),
        z=4.5 - 10.5 * t,
    )


def flight_path(aim, kick=None):
    points = [ball_at(aim, kick or DEFAULT_KICK, i / 16) for i in range(17)]
    return [dict(x=p["x"] / 3.66, y=p["y"] / 2.44) for p in points]


def observe_ball(aim, kick=None):
    kick = kick or DEFAULT_KICK
    samples = []
    for ms in [0, CONFIG["observationMs"] / 2, CONFIG["observationMs"]]:
        p = ball_at(aim, kick, ms / flight_ms(kick))
        samples.append(
            dict(
                ms=ms,
                x=round(p["x"], 2),
                y=round(p["y"], 2),
                distanceToGoal=round(p["z"] + 6, 2),
            )
        )
    return samples


# Extrapolate only observed velocity. The true target and curl are unavailable here.
def keeper_observation(samples):
    a, b, c = samples
    seconds = (c["ms"] - a["ms"]) / 1000
    vx, vy = (c["x"] - a["x"]) / seconds, (c["y"] - a["y"]) / seconds
    vz = (a["distanceToGoal"] - c["distanceToGoal"]) / seconds
    time = b["distanceToGoal"] / vz
    x, y = b["x"] + vx * time, b["y"] + vy * time - 4.905 * time**2
    return dict(
        estimate=dict(
            horizontalRange=[round(x - 0.6, 2), round(x + 0.6, 2)],
            heightRange=[round(y - 0.25, 2), round(y + 0.25, 2)],
            note="Rough goal-line range, estimated ONLY from early measured velocity and gravity. Sideways acceleration is unknown: a curling shot can land outside this range. This is not the actual destination.",
        ),
        measuredMotion=dict(
            atMs=b["ms"],
            horizontalMetresPerSecond=round(vx, 2),
            verticalMetresPerSecond=round(vy, 2),
            forwardMetresPerSecond=round(vz, 2),
        ),
        observedMs=CONFIG["observationMs"],
        ball=[{k: s[k] for k in ("ms", "x", "y", "distanceToGoal")} for s in samples],
        goal=dict(leftPost=-3.66, rightPost=3.66, crossbar=2.44, ground=0),
        coordinates="Metres, shooter's view: negative x is screen left, positive x is screen right, y is height. distanceToGoal decreases as the ball approaches. Samples are observations after foot contact, not a planned route. Gravity is 9.81 m/s²; the ball can curve sideways. The future landing point is unknown.",
    )
