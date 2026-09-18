export type Aim = { x: number; y: number };
export type Decision = {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  model: string;
  durationMs: number;
  state: { ball: { projectedCrossing: Aim }; coordinates: string };
};
export type Shot = {
  number: number;
  decision?: Decision;
  aim?: Aim;
  outcome?: "goal" | "saved" | "wide";
  keeper?: Aim;
  keeperAction?: "dive" | "hold";
  committedAt?: string;
};
export type State = { shots: Shot[]; finished: boolean; started?: boolean };
export type Match = {
  id: string;
  name: string;
  owner_hash: string;
  state: State;
};
export type Game = {
  id: string;
  name: string;
  shots: Shot[];
  started: boolean;
  ready: boolean;
  finished: boolean;
  attempts: number;
  goals: number;
  totalAttempts: number;
  totalGoals: number;
};
export type Command = {
  matchId: string;
  owner: string;
  name?: string;
  number?: number;
  aim?: Aim;
};
export type Span = {
  id: string;
  name: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  retries: number;
};
export type Trace = {
  id: string;
  status: string;
  spans: Span[];
  number?: number;
};
