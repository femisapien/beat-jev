CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY,
  owner_hash text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
  state jsonb NOT NULL DEFAULT '{"shots":[],"finished":false}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS matches_owner ON matches(owner_hash, created_at DESC);

-- A durable input slot lets parallel tasks start before the player releases.
CREATE TABLE IF NOT EXISTS penalty_inputs (
  match_id uuid NOT NULL REFERENCES matches(id),
  number integer NOT NULL CHECK (number BETWEEN 1 AND 10),
  id uuid NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  player_ready boolean NOT NULL DEFAULT false,
  keeper_ready boolean NOT NULL DEFAULT false,
  input jsonb,
  released_at timestamptz,
  reaction jsonb,
  PRIMARY KEY(match_id, number)
);

-- Additive upgrade: existing games and their scores remain readable.
ALTER TABLE penalty_inputs DROP CONSTRAINT IF EXISTS penalty_inputs_number_check;
ALTER TABLE penalty_inputs ADD CONSTRAINT penalty_inputs_number_check CHECK (number BETWEEN 1 AND 10);
ALTER TABLE penalty_inputs ADD COLUMN IF NOT EXISTS attack jsonb;
ALTER TABLE penalty_inputs ADD COLUMN IF NOT EXISTS defense jsonb;
CREATE TABLE IF NOT EXISTS match_runs (
  match_id uuid PRIMARY KEY,
  owner_hash text NOT NULL,
  run_id text
);
