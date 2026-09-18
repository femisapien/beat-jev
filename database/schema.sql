CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY,
  owner_hash text NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
  state jsonb NOT NULL DEFAULT '{"shots":[],"finished":false}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS matches_owner ON matches(owner_hash, created_at DESC);
