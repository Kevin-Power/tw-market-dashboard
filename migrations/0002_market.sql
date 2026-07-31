-- Latest market dashboard snapshot (one row, always id = 1)
CREATE TABLE IF NOT EXISTS market_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  as_of TEXT NOT NULL,
  payload JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT 'seed',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
