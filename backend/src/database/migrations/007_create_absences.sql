CREATE TABLE IF NOT EXISTS absences (
  id           SERIAL PRIMARY KEY,
  consultant_id INTEGER NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT absences_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS absences_consultant_id_idx ON absences(consultant_id);
