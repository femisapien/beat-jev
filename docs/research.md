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

The previous reactive version supplied the exact destination and calculated lane/height labels. That made the goalkeeper an oracle. It is replaced by early-flight observations and a rough velocity-based range. Local rendering uses a bounded ballistic arc with curl, and the inference call waits until the observed 160 ms has elapsed.

Live probes on 18 September 2026: raw early coordinates matched 6/16 expected actions; adding velocity and asking Jev to do the extrapolation matched 3/16. Supplying a range calculated solely from those observations and explicit zone bounds matched 14/16 in a subsequent probe. A follow-up probe matched 14/18 after adding two curling shots, both of which fooled the early-flight estimate and drew Jev to the wrong zone. These small probes informed the prompt; they are not held-out accuracy evidence. The range can be wrong on curved shots. `tests/keeper-live.ts` reports prediction quality diagnostically and checks the response contract. Deterministic tests check the information boundary and matching Python/TypeScript motion.

## Characters and stadium

The September 18 art pass replaces the original placeholder with a MakeHuman / MPFB human rig and fitted clothing. The runtime uses Three.js and React Three Fiber, PBR materials, a textured pitch, instanced spectators and procedural kick/dive poses. It does not use motion capture or professional football player likenesses.

Source and license review: <a href="https://static.makehumancommunity.org/assets/assetpacks.html" target="_blank" rel="noopener noreferrer">MakeHuman asset packs</a>, <a href="https://ambientcg.com/view?id=Grass005" target="_blank" rel="noopener noreferrer">ambientCG Grass005</a>, and <a href="https://polyhaven.com/a/stadium_01" target="_blank" rel="noopener noreferrer">Poly Haven Stadium 01</a>. Most assets are CC0. The Elvaerwyn shorts are CC BY; attribution and modifications are listed in the game’s asset credits.
