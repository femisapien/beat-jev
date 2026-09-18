# Beat Jev

A separate playable demo, preserving [Route Lab](https://github.com/ojusave/route-lab).

Five penalties against a goalkeeper controlled by TypeSafe Jev. Aim directly on a 3D pitch. Show the score, five attempt markers, and one compact Render Workflows activity strip. Keep technical details behind an expandable trace. Try again starts a new match with the same name. Network retry repeats the same action, never a new attempt.

React Three Fiber and Three.js render original stylized characters, a net, and a pitch. No external character assets. The browser animates the authoritative result; it does not decide scores. Mouse/touch aim plus a keyboard equivalent. Respect reduced motion. First viewport must contain the goal and primary action at desktop and mobile widths.

All match mutations run in Render Workflows. start_game creates the match and chains prepare_penalty. take_shot chains record_shot then prepare_penalty or finish_game. Postgres stores committed keeper decisions and shots under a row lock. Web services validate and dispatch requests, read state, and expose only the requesting player's traces. Never reveal the prepared keeper choice before the shot.

Jev sees previous completed shots, never the current target. Code determines goal geometry, keeper reach, and misses. An off-target shot does not trigger a dive. Display Jev's actual action, probabilities, and measured API duration only after the shot. Do not describe probability as chance of a save or supplied history as model training.

Verification: both SDKs, five-shot game, wide/goal/save outcomes, retry with same shot, conflicting retry, concurrent submissions, refresh recovery, duplicate match start, cross-player access, hidden next decision, separate Blueprints with paid web + workflow + paid Postgres, desktop/mobile/keyboard/reduced motion. Measure actual workflow latency before any speed claim.
