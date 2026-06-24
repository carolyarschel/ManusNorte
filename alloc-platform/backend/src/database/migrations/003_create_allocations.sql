-- Allocations: the source of truth for "who visits where on which day".
-- The UNIQUE constraint enforces: one consultant can only be in ONE project per weekday.
-- (cadence is checked at application level since biweekly alternates weeks)

CREATE TABLE allocations (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  consultant_id   INTEGER NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
  weekday         INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 5),  -- 1=Mon..5=Fri
  role            VARCHAR(20) NOT NULL DEFAULT 'consultor',          -- 'líder' or 'consultor'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- CRITICAL: a consultant cannot be in two WEEKLY projects on the same day.
  -- For biweekly projects this is relaxed at application level (alternating weeks).
  UNIQUE (consultant_id, weekday, project_id)
);

CREATE INDEX idx_allocations_project    ON allocations(project_id);
CREATE INDEX idx_allocations_consultant ON allocations(consultant_id);
CREATE INDEX idx_allocations_weekday    ON allocations(weekday);

-- View: easy lookup of all allocations with names
CREATE VIEW allocations_detail AS
SELECT
  a.id AS allocation_id,
  a.weekday,
  a.role,
  p.id AS project_id,
  p.acronym AS project_acronym,
  p.client AS project_client,
  p.status AS project_status,
  p.cadence,
  p.start_date,
  p.end_date,
  c.id AS consultant_id,
  c.name AS consultant_name,
  c.level AS consultant_level,
  c.is_leader AS consultant_is_leader,
  c.max_days AS consultant_max_days
FROM allocations a
JOIN projects p ON a.project_id = p.id
JOIN consultants c ON a.consultant_id = c.id;
