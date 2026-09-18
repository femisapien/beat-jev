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
from app.store import migrate, read_match, totals
from app.game import public_game
from app.runs import render, WORKFLOW, read_trace


@asynccontextmanager
async def lifespan(app):
    await migrate()
    yield


app = FastAPI(lifespan=lifespan)
limits = {}


class Aim(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    x: float = Field(ge=-1.6, le=1.6)
    y: float = Field(ge=-0.4, le=1.5)


class Play(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["start", "shoot"]
    matchId: UUID
    name: str | None = Field(default=None, min_length=1, max_length=24)
    number: int | None = Field(default=None, ge=1, le=5, strict=True)
    aim: Aim | None = None


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
        if body.number is None or body.aim is None:
            return JSONResponse({"error": "Invalid penalty."}, 400)
        try:
            match = await read_match(cmd["matchId"], cmd["owner"])
        except LookupError:
            return JSONResponse({"error": "Match not found."}, 404)
        aim = body.aim.model_dump()
        shot = next(
            (s for s in match["state"]["shots"] if s["number"] == body.number), None
        )
        if (
            not shot
            and (
                not match["state"].get("started")
                or match["state"]["finished"]
                or body.number
                != sum(bool(s.get("outcome")) for s in match["state"]["shots"]) + 1
            )
        ) or (shot and shot.get("aim") and shot["aim"] != aim):
            return JSONResponse({"error": "That penalty is not available."}, 409)
        cmd.update(number=body.number, aim=aim)
    try:
        run = await render.workflows.start_task(
            f"{WORKFLOW}/{'start_game' if body.action == 'start' else 'take_penalty'}",
            [cmd],
        )
        return JSONResponse(dict(runId=run.id), 202)
    except Exception:
        return JSONResponse(
            {"error": "Could not start the task. Retry the same action."}, 503
        )


@app.get("/api/matches/{match_id}")
async def game(match_id: UUID, request: Request):
    try:
        return public_game(
            await read_match(str(match_id), request.state.owner),
            await totals(request.state.owner),
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
