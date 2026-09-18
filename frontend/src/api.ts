export const language =
  import.meta.env.VITE_EXAMPLE === "python" ? "python" : "typescript";
const key = "beat-jev-player";
let token = localStorage.getItem(key);
if (!token) {
  token = crypto.randomUUID();
  localStorage.setItem(key, token);
}
let clockOffset = 0,
  bestRoundTrip = Infinity;
export const serverTime = () => Date.now() + clockOffset;
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const sent = Date.now();
  const r = await fetch("/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  const received = Date.now();
  if (typeof data.serverNow === "number" && received - sent < bestRoundTrip) {
    bestRoundTrip = received - sent;
    clockOffset = data.serverNow - (sent + received) / 2;
  }
  if (!r.ok)
    throw new Error(data.error || "Connection interrupted. Retry your shot.");
  return data;
}
export type Play = {
  action: "start" | "arm" | "shoot";
  matchId: string;
  name?: string;
  number?: number;
  aim?: { x: number; y: number };
  path?: { x: number; y: number }[];
  releasedAt?: number;
};
export type Session = {
  matchId: string;
  runId?: string;
  runIds?: string[];
  command: Play;
};
export const sessionKey = "beat-jev-v3-" + language;
