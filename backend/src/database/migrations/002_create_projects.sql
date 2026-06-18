CREATE TYPE project_status AS ENUM ('confirmed', 'hot', 'cold', 'archived');
CREATE TYPE cadence_type   AS ENUM ('weekly', 'biweekly_odd', 'biweekly_even');

CREATE TABLE projects (
  id          SERIAL PRIMARY KEY,
  acronym     VARCHAR(5) NOT NULL,
  client      VARCHAR(200) NOT NULL,
  status      project_status NOT NULL DEFAULT 'cold',
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  cadence     cadence_type NOT NULL DEFAULT 'weekly',
  -- Resolved allocation (union of all visit days after simulation/manual)
  visit_days  INTEGER[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_dates CHECK (end_date >= start_date)
);

-- Level slots: "I need 1 senior leader 2x/week"
CREATE TABLE level_slots (
  id             SERIAL PRIMARY KEY,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  level          consultant_level NOT NULL,
  is_leader      BOOLEAN NOT NULL DEFAULT false,
  days_per_week  INTEGER NOT NULL CHECK (days_per_week BETWEEN 1 AND 5),
  visit_days     INTEGER[] NOT NULL DEFAULT '{}',  -- empty = simulation decides
  -- Resolved: which consultant was assigned to this slot
  assigned_consultant_id INTEGER REFERENCES consultants(id) ON DELETE SET NULL,
  assigned_days  INTEGER[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pinned slots: "I need Ana specifically, 2x/week"
CREATE TABLE pinned_slots (
  id             SERIAL PRIMARY KEY,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  consultant_id  INTEGER NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  days_per_week  INTEGER NOT NULL CHECK (days_per_week BETWEEN 1 AND 5),
  visit_days     INTEGER[] NOT NULL DEFAULT '{}',  -- empty = simulation decides
  -- Resolved days (may differ from visit_days if simulation picked them)
  assigned_days  INTEGER[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_projects_status     ON projects(status);
CREATE INDEX idx_projects_dates      ON projects(start_date, end_date);
CREATE INDEX idx_level_slots_project ON level_slots(project_id);
CREATE INDEX idx_pinned_slots_project ON pinned_slots(project_id);
CREATE INDEX idx_pinned_slots_consultant ON pinned_slots(consultant_id);
