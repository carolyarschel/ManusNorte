-- Consultant levels: junior, pleno, senior
CREATE TYPE consultant_level AS ENUM ('junior', 'pleno', 'senior');

CREATE TABLE consultants (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  level         consultant_level NOT NULL DEFAULT 'junior',
  is_leader     BOOLEAN NOT NULL DEFAULT false,
  max_days      INTEGER NOT NULL DEFAULT 5 CHECK (max_days BETWEEN 1 AND 5),
  restrictions  INTEGER[] NOT NULL DEFAULT '{}',  -- array of weekday numbers (1=Mon..5=Fri)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing
CREATE INDEX idx_consultants_level ON consultants(level);
CREATE INDEX idx_consultants_is_leader ON consultants(is_leader);
