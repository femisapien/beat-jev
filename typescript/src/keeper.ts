import { TypeSafeClient, choice, type JsonValue } from "@typesafe-ai/sdk";
import { keeperObservation, type BallSample } from "../../shared/flight";
import config from "../../shared/game.json";
import type { Decision, Shot } from "../../shared/types";
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
export function decidePosition(history: Shot[]): Promise<Decision> {
  return decide(
    {
      completedKicks: history
        .filter((s) => s.shooter !== "jev" && s.outcome)
        .map((s) => ({ target: s.aim || null, outcome: s.outcome || null })),
      coordinates:
        "Shooter view. Negative x is left, positive x is right. The next aim is not available.",
    },
    config.positionQuestion,
    config.positionCriteria,
    2500,
  );
}
export async function decideKeeper(
  samples: BallSample[],
  timeout = 10000,
): Promise<Decision> {
  return decide(
    keeperObservation(samples),
    config.question,
    config.criteria,
    timeout,
  );
}
