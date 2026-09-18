import hashlib
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal
from uuid import UUID
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from app.store import migrate, read_match, totals, pool, start_run
from app.game import public_game
from app.runs import render, WORKFLOW, read_trace, client
from app.inputs import release_input, read_input, public_turn, save_defense


@asynccontextmanager
async def lifespan(app):
    await migrate()
    yield
    await pool.close()
    await client.aclose()


app = FastAPI(lifespan=lifespan)
limits = {}


class Aim(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    x: float = Field(ge=-1.6, le=1.6)
    y: float = Field(ge=0.035, le=1.5)


class PathPoint(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    x: float = Field(ge=-4, le=4)
    y: float = Field(ge=0.035, le=5)


class Play(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["start", "shoot", "ready", "defend"]
    matchId: UUID
    name: str | None = Field(default=None, min_length=1, max_length=24)
    number: int | None = Field(default=None, ge=1, le=10, strict=True)
    aim: Aim | None = None
    releasedAt: float | None = Field(default=None, allow_inf_nan=False)
    path: list[PathPoint] | None = Field(default=None, min_length=2, max_length=32)


@app.middleware("http")
async def session(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        token = request.headers.get("authorization", "").removeprefix("Bearer ")
        if not re.fullmatch(
            r"[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}", token
        ):
            return JSONResponse({"error": "Player session required."}, 401)
        request.state.owner = hashlib.sha256(token.encode()).hexdigest()
        if request.method == "POST":
            if int(request.headers.get("content-length", "0")) > 4096:
                return JSONResponse({"error": "Request too large."}, 413)
            ip = request.client.host
            now = time.monotonic()
            if len(limits) > 2000:
                for key in list(limits):
                    if limits[key][1] < now:
                        del limits[key]
            count, until = limits.get(ip, (0, now + 60))
            if until < now:
                count, until = 0, now + 60
            if count >= 45:
                return JSONResponse({"error": "Take a short break, then retry."}, 429)
            limits[ip] = (count + 1, until)
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
async def health():
    return dict(language="python", game="beat-jev")


@app.post("/api/play")
async def play(request: Request):
    try:
        body = Play.model_validate(await request.json())
    except (ValidationError, ValueError):
        return JSONResponse({"error": "Invalid game action."}, 400)
    cmd = dict(matchId=str(body.matchId), owner=request.state.owner)
    if body.action == "start":
        if not body.name or not body.name.strip():
            return JSONResponse(
                {"error": "Use a name between 1 and 24 characters."}, 400
            )
        cmd["name"] = body.name.strip()
    else:
        if body.number is None:
            return JSONResponse({"error": "Invalid penalty."}, 400)
        try:
            match = await read_match(cmd["matchId"], cmd["owner"])
        except LookupError:
            return JSONResponse({"error": "Match not found."}, 404)
        existing = next(
            (s for s in match["state"]["shots"] if s["number"] == body.number), None
        )
        if not existing and (
            not match["state"].get("started")
            or match["state"]["finished"]
            or match["state"].get("abandoned")
            or body.number
            != sum(bool(s.get("outcome")) for s in match["state"]["shots"]) + 1
        ):
            return JSONResponse({"error": "That penalty is not available."}, 409)
        cmd["number"] = body.number
        if body.action == "ready":
            if body.number % 2:
                return JSONResponse({"error": "It is your turn to shoot."}, 409)
            slot = await read_input(cmd["matchId"], body.number)
            if not slot or not slot["attack"]:
                return JSONResponse({"error": "Jev is still choosing."}, 409)
            try:
                await release_input(
                    cmd["matchId"],
                    body.number,
                    dict(aim=slot["attack"]["aim"], path=slot["attack"]["path"]),
                )
            except ValueError as e:
                return JSONResponse(dict(error=str(e)), 409)
            return JSONResponse(dict(attack=slot["attack"]), 202)
        elif body.action == "defend":
            if (
                body.number % 2
                or body.aim is None
                or abs(body.aim.x) > 0.9
                or body.aim.y not in [0.25, 0.76]
            ):
                return JSONResponse({"error": "Invalid keeper position."}, 400)
            try:
                await save_defense(cmd["matchId"], body.number, body.aim.model_dump())
            except ValueError as e:
                return JSONResponse(dict(error=str(e)), 409)
            return JSONResponse(dict(saved=True), 202)
        else:
            if body.number % 2 == 0:
                return JSONResponse({"error": "It is Jev's turn to shoot."}, 409)
            if body.aim is None:
                return JSONResponse({"error": "Invalid shot path."}, 400)
            aim = body.aim.model_dump()
            path = (
                [p.model_dump() for p in body.path]
                if body.path
                else [dict(x=0, y=0.06), aim]
            )
            if path[-1] != aim:
                return JSONResponse({"error": "Invalid shot path."}, 400)
            try:
                await release_input(
                    cmd["matchId"],
                    body.number,
                    dict(aim=aim, path=path),
                    body.releasedAt,
                )
                return JSONResponse(dict(released=True), 202)
            except ValueError as e:
                return JSONResponse(dict(error=str(e)), 409)
    try:

        async def start():
            return (await render.workflows.start_task(f"{WORKFLOW}/run_game", [cmd])).id

        run_id = await start_run(cmd["matchId"], cmd["owner"], start)
        return JSONResponse(dict(runId=run_id), 202)
    except Exception:
        return JSONResponse(
            {"error": "Could not start the task. Retry the same action."}, 503
        )


@app.get("/api/matches/{match_id}")
async def game(match_id: UUID, request: Request):
    try:
        match = await read_match(str(match_id), request.state.owner)
        slot = await read_input(str(match_id))
        return dict(
            **public_game(match, await totals(request.state.owner)),
            turn=public_turn(slot),
            activeShot=slot["reaction"] if slot else None,
            incomingShot=dict(
                **slot["attack"], releasedAt=slot["released_at"].timestamp() * 1000
            )
            if slot and slot["released_at"] and slot["attack"]
            else None,
            serverNow=time.time() * 1000,
        )
    except LookupError:
        return JSONResponse({"error": "Match not found."}, 404)


@app.get("/api/runs/{run_id}")
async def trace(run_id: str, request: Request):
    if not re.fullmatch(r"trn-[a-z0-9]+", run_id):
        return JSONResponse({"error": "Trace not found."}, 404)
    try:
        return await read_trace(run_id, request.state.owner)
    except Exception:
        return JSONResponse({"error": "Trace not found."}, 404)


static = Path(__file__).resolve().parents[2] / "dist/python"
if static.exists():
    app.mount("/", StaticFiles(directory=static, html=True), name="frontend")
