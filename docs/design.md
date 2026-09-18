# Beat Jev

A five-round shootout, with one kick per player per round. Route Lab stays unchanged.

Enter a name, take a shot, then take the gloves. The white kit is always the human and purple is always Jev. The scoreboard shows both scores; two rows of five markers preserve each player's attempts. A draw is a valid result. Try again starts a new match.

On human kicks, tap a target or swipe for power and curl, then release to shoot. After a brief result, switch roles automatically. A 3-2-1 countdown announces Jev’s kick. Move with Left/Right or A/D, and hold Space, Up, or W to jump. Mobile buttons perform the same actions. Jev's target is committed before the human moves and hidden until release. Give the player control during the countdown and flight, then freeze the keeper at impact. Pause automatic transitions when the pitch is out of view, the tab is hidden, or the help panel is open. Keep only Play, Try again, and recovery buttons; shots and saves are direct input.

Use MakeHuman figures with fitted, separately modeled football kits, Three.js, and React Three Fiber. Reuse the pitch and swap kits when roles change. Keep controls and current role visible. Respect reduced motion. Align result text and score changes with ball arrival; never show a save before the ball reaches the keeper.

One root Render task owns registration, match start, ten sequential penalty child tasks, and finish. Each penalty prepares an input slot, starts player/keeper subtasks in parallel, and joins them before recording the score. The right panel displays actual Render task hierarchy, states, and IDs. Completed turns collapse. The top strip shows five rounds. Durations include waiting, never invented completion percentages.

Postgres owns input and score records. Browser animation and key events remain local. Each input window expires after 90 seconds, and the match then closes without inventing a kick. Completed attempts remain in the player's browser-scoped totals.

Jev chooses typed actions from an uncertain range inferred from 160 ms of early flight. Never send the actual target, full path, or target labels. Swipes create one bounded bend, never arbitrary waypoints. Code computes geometry and saves. Shot decisions use only completed human keeper history. A score compares play in this game, not general intelligence. Show choice probabilities without labeling them save odds.

Verify full alternating matches, one actual root, nested sequential/parallel task relationships, saves/goals/misses, timing, retries, ownership, refresh recovery, and desktop/mobile controls in both SDK versions before deployment.
