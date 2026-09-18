export type Kick = { power: number; curl: number };
export type Aim = { x: number; y: number };
export type Decision = {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  model: string;
  durationMs: number;
  state: Record<string, unknown>;
};
export type Shot = {
  number: number;
  shooter?: "player" | "jev";
  path?: Aim[];
  kick?: Kick;
  reaction?: "ready" | "late" | "unavailable";
  reactionMs?: number;
  decision?: Decision;
  aim?: Aim;
  outcome?: "goal" | "saved" | "wide";
  keeper?: Aim;
  keeperAction?: "dive" | "hold";
  committedAt?: string;
  releasedAt?: number;
};
export type State = {
  shots: Shot[];
  finished: boolean;
  started?: boolean;
  abandoned?: boolean;
};
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
  jevGoals: number;
  abandoned?: boolean;
  totalAttempts: number;
  totalGoals: number;
  turn?: Turn;
  activeShot?: Shot;
  incomingShot?: Shot;
  serverNow?: number;
};
export type Command = {
  matchId: string;
  owner: string;
  name?: string;
  number?: number;
  aim?: Aim;
  path?: Aim[];
  kick?: Kick;
  inputId?: string;
};
export type Turn = {
  id: string;
  number: number;
  ready: boolean;
  expired: boolean;
  submitted: boolean;
  shooter: "player" | "jev";
};
export type Span = {
  id: string;
  name: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  retries: number;
  parentId?: string;
  number?: number;
};
export type Trace = {
  id: string;
  status: string;
  spans: Span[];
  number?: number;
};
