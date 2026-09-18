# Source review

Reviewed September 17, 2026. These are implementation references, not claims about benchmark performance.

| Source inspected                                                                                                                                      | What the code does                                                                                 | Applied here                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| <a href="https://gist.github.com/L4Ph/71bacb8de3b9f1888d299df36ff0a377" target="_blank" rel="noopener noreferrer">Flappy-style game source</a>        | Sends position, speed and gap observations. Jev chooses a policy; local code handles frame timing. | Separate action selection from rendering.                          |
| <a href="https://github.com/fhshaik/typesafe-mario/blob/main/src/typesafe_mario/policy.py" target="_blank" rel="noopener noreferrer">Mario policy</a> | Defines legal actions and uses calculated terrain, timing and hazard facts.                        | Supply observations instead of asking Jev to perform geometry.     |
| <a href="https://github.com/sorrycc/typesafe-snake/blob/master/src/jev/prompt.ts" target="_blank" rel="noopener noreferrer">Snake prompt</a>          | Gives current board state and code-calculated facts beside action choices.                         | Describe actions explicitly and make the actual input inspectable. |

The specific Subway Surfers demo's source was not located. Its social demonstration was not used as evidence of a particular implementation.

TypeSafe's <a href="https://docs.typesafe.ai/concepts/state" target="_blank" rel="noopener noreferrer">state documentation</a> specifies text and structured data, not images. Its <a href="https://docs.typesafe.ai/confidence" target="_blank" rel="noopener noreferrer">confidence documentation</a> describes concentration of the option distribution. Confidence is not the chance of making a save.

## Prompt checks

The first reactive version received only numeric crossing coordinates. It chose the expected action in 13 of 16 live cases, with errors on high, below-goal and near-center shots. The revised version adds calculated horizontal lane, height and whether the path enters the goal. It matched all 16 cases in one live run. These are smoke tests, not a statistically reliable accuracy estimate. Run `tests/keeper-live.ts` to repeat the checks against the current model.

## Characters

<a href="https://quaternius.com/packs/universalbasecharacters.html" target="_blank" rel="noopener noreferrer">Quaternius Universal Base Characters</a> supplies the human mesh, skeleton, skin textures, eyes, and hair under CC0. The free Standard pack is sufficient. The game uses Three.js and React Three Fiber, custom football materials, and bone poses for the kick and dive. It uses no assets from commercial football games.
