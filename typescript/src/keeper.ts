import { TypeSafeClient, choice, type JsonValue } from "@typesafe-ai/sdk";
import config from "../../shared/game.json";
import type { Aim, Decision, Shot } from "../../shared/types";
async function decide(
  state: Record<string, JsonValue>,
  question: string,
  criteria: Record<string, string>,
  timeout: number,
): Promise<Decision> {
  const start = performance.now();
  const result = await new TypeSafeClient({
    timeout,
    retry: { maxRetries: 0 },
  }).systemOne({
    state,
    questions: { action: choice(question, criteria) },
  });
  const answer = result.answers.action;
  if (!answer || !(answer.choice in criteria))
    throw new Error("Jev decision unavailable.");
  return {
    choice: answer.choice,
    probabilities: answer.probabilities,
    confidence: answer.confidence,
    model: result.model,
    durationMs: Math.round(performance.now() - start),
    state,
  };
}
export function decideShot(history: Shot[]): Promise<Decision> {
  return decide(
    {
      history: history
        .filter((s) => s.shooter === "jev" && s.outcome)
        .map((s) => ({
          target: s.aim || null,
          goalkeeper: s.keeper || null,
          outcome: s.outcome || null,
        })),
      coordinates:
        "Shooter view: x=-1 left post, x=1 right post, y=0 grass, y=1 crossbar. No current goalkeeper position is provided.",
    },
    config.shootQuestion,
    config.shootCriteria,
    5000,
  );
}
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
  return decide(state, config.question, config.criteria, timeout);
}
