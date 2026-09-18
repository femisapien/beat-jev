import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import config from "../../shared/game.json";
import type { Decision, Shot } from "../../shared/types";
export async function decideKeeper(shots: Shot[]): Promise<Decision> {
  const history = shots
    .filter((s) => s.outcome)
    .map((s) => ({ aim: s.aim!, outcome: s.outcome! }));
  const options = Object.fromEntries(
    Object.entries(config.zones).map(([id, z]) => [id, z.label]),
  );
  const start = performance.now();
  const result = await new TypeSafeClient({
    timeout: 10000,
    retry: { maxRetries: 0 },
  }).systemOne({
    state: { history },
    questions: { defend: choice(config.question, options) },
  });
  const answer = result.answers.defend;
  if (!answer || !(answer.choice in options))
    throw new Error("Keeper decision unavailable.");
  return {
    choice: answer.choice,
    probabilities: answer.probabilities,
    confidence: answer.confidence,
    model: result.model,
    durationMs: Math.round(performance.now() - start),
    history,
  };
}
