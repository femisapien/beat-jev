import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import config from "../../shared/game.json";
import type { Aim, Decision } from "../../shared/types";
export async function decideKeeper(
  aim: Aim,
  path: Aim[] = [],
  timeout = 10000,
): Promise<Decision> {
  const state = {
    ball: {
      projectedCrossing: aim,
      trajectory: path,
      horizontal: aim.x < -0.31 ? "left" : aim.x > 0.31 ? "right" : "center",
      height: aim.y < 0.505 ? "low" : "high",
      path:
        Math.abs(aim.x) > 0.965 || aim.y < 0.035 || aim.y > 0.965
          ? "outside the goal"
          : "on target",
    },
    coordinates:
      "Shooter view: x=-1 left post, x=0 center, x=1 right post. y=0 grass, y=1 crossbar. The crossing is computed by the game, not inferred from an image.",
  };
  const start = performance.now();
  const result = await new TypeSafeClient({
    timeout,
    retry: { maxRetries: 0 },
  }).systemOne({
    state,
    questions: { defend: choice(config.question, config.criteria) },
  });
  const answer = result.answers.defend;
  if (!answer || !(answer.choice in config.criteria))
    throw new Error("Keeper decision unavailable.");
  return {
    choice: answer.choice,
    probabilities: answer.probabilities,
    confidence: answer.confidence,
    model: result.model,
    durationMs: Math.round(performance.now() - start),
    state,
  };
}
