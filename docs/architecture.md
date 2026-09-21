# How the shootout works

One match is one `run_game` task run. Five rounds each contain your kick followed by Jev's kick.

```mermaid
flowchart TD
  Game[run_game] --> Register[register_player]
  Register --> Begin[begin_match]
  Begin --> Turn[take_penalty, turns 1 to 10 sequentially]
  Turn --> Prepare[prepare_turn]
  Turn --> Position[position_goalkeeper, human kicks]
  Position --> Player
  Position --> Keeper
  Prepare --> Player[player_kick or jev_kick]
  Prepare --> Keeper[goalkeeper_action or player_save]
  Player --> Record[record_result]
  Keeper --> Record
  Record --> Finish[finish_match, after turn 10]
```

`run_game` calls each penalty using `ctx.run`. Inside the penalty, player and goalkeeper tasks run together with `Promise.all` in TypeScript or `asyncio.gather` in Python. They wait for the same Postgres input slot. Saving the result joins both tasks. The API starts only the match root. Every other task is its descendant.

## Playing

- **Your kick:** tap a target or swipe for power and curl. Release starts the local animation immediately. Both APIs rebuild a smooth bounded arc, ignoring legacy waypoints. The goalkeeper task waits for the 900 ms run-up plus 160 ms of ball flight, then sends only three past positions, measured velocity, and an estimated goal-line range to Jev. The actual target and complete path remain inside the game.
- **Jev's kick:** Jev chooses a typed target using only completed goalkeeper history. That target is stored before the countdown starts. The API does not reveal it until automatic release. Use Left/Right or A/D to move; hold Space, Up, or W to jump. Touch buttons provide the same controls. The keeper position is frozen at impact and submitted once.
- Five kicks each, most goals wins. Equal scores are a draw. **Try again** starts a new root run and keeps this browser's human goals/attempts.

The white kit is always you; purple is always Jev. The players swap roles. Results and score changes appear after ball arrival. The right panel shows one match ID, ten nested turns, actual Render task IDs, statuses, timestamps, and retries. Task durations include waiting for input. Animation frames and key events run locally.

## Timing and recovery

Results stay visible for 1.2 seconds, then roles switch automatically once the next Render turn is ready. Jev’s committed shot releases after a 3-2-1 countdown (2.1 seconds). The player can position the goalkeeper during that countdown. Automatic transitions stop when the pitch is out of view, the tab is hidden, or help is open; a returning player gets a fresh countdown. A shot already in flight continues under the existing server deadlines.

Jev has 670 ms after foot contact (1,570 ms after release) to choose a save. Browser clock calibration is approximate; network transit and inference consume that window. A late or unavailable answer cannot save. The ball takes 900 ms of run-up and 1,200 to 1,400 ms of flight depending on power (1,300 ms for taps). The browser does not restart the ball clock when a decision arrives. Before each human kick, a `position_goalkeeper` task chooses left, center, or right from completed kicks only. It runs alongside input-slot preparation. The stored choice shifts the keeper by up to 0.55 m; it is reused on retry. Neutral positioning is the disclosed fallback if that call is unavailable. Lateral travel is capped at 4.8 m/s after a 100 ms push-off, so a wrong initial position or slow decision reduces coverage. The keeper moves toward Jev's chosen zone, never the exact shot coordinates. A fast decision waits until the final 650 ms of flight to dive, reaching the zone at ball arrival. The game no longer overrides a dive when the true target is wide: Jev can misjudge a miss. Late browser delivery still requires at least 450 ms of movement. Saves use the zone's reach area, not a simulated glove collision.

For your save, controls stop at impact. The API allows five seconds from release for the final position to arrive. Missing input counts as a missed save. This is a browser game demonstration, not an authoritative multiplayer or anti-cheat system. A client could forge its position. AI and human turns also use different decision windows, so scores do not measure general intelligence.

Each turn waits up to 90 seconds for release. If abandoned, the match closes without inventing another kick. A whole match is bounded to 20 minutes. Waiting tasks use compute. Task preparation still takes time; it happens while the preceding result is displayed.

Postgres row locks protect score updates. Immutable input, target, reaction, and defense records preserve the first accepted action on retry. Repeat start requests reuse the stored root ID. This does not claim exactly-once submission across a server crash between the Render request and database commit. Child tasks retry twice; parent and penalty tasks do not automatically replay. If a task ultimately fails, start a new match; completed scores remain stored.

## Modules and data

- Each SDK folder has its own API, workflow, storage, input coordination, game rules, and TypeSafe adapter. Both use the shared React Three Fiber frontend.
- `shared/game.json` holds the save/shot questions, action criteria, geometry, and timing.
- `keeper.ts` and `keeper.py` own the three TypeSafe decisions. Jev receives structured observations, not images or nicknames. Code resolves collisions.
- Render Postgres stores nicknames, paths, goalkeeper inputs, and scores. A hashed browser token gates matches and traces. There is no public leaderboard or cross-browser login.
- Blueprints independently deploy paid web services, usage-billed workflows, and paid Postgres. They prompt for TypeSafe and Render API keys.
- The human rig uses MakeHuman / MPFB. Asset credits and licenses are in `frontend/public/models` and `/credits.html`.

## Verification

```sh
npm run build
npm test
PYTHONPATH=python python/.venv/bin/python -m unittest discover -s python
node tests/live-smoke.mjs http://127.0.0.1:3101
node tests/live-smoke.mjs http://127.0.0.1:3102
node tests/ui-smoke.mjs
render blueprints validate render.yaml
render blueprints validate python/render.yaml
```

Live tests call TypeSafe, Render, and Postgres. They verify a complete match, one root with sequential penalty descendants and overlapping player/keeper children, hidden targets, keyboard/touch controls, timing, score integrity, retries, ownership, reload, and Try again. These are implementation checks, not a novice usability study. GitHub may strip README new-tab attributes; app links use them directly.

The early-flight estimator uses finite-difference velocity and gravity, without assuming future sideways acceleration. Its fixed range margins (0.6 m horizontally, 0.25 m vertically) are gameplay heuristics, not calibrated confidence intervals. Curl can fool it. Jev chooses coverage from this estimate, not from video, the actual endpoint, or a preselected zone. `shared/flight.ts` and `python/app/flight.py` implement the same motion and observation boundary; parity tests cover both. This is still an arcade simulation with six defensive zones, not a football physics engine.
