ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS leader_consultant_id INTEGER REFERENCES consultants(id) ON DELETE SET NULL;
