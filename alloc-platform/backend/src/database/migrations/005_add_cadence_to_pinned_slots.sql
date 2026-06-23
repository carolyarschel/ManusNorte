ALTER TABLE pinned_slots
  ADD COLUMN IF NOT EXISTS cadence cadence_type;
-- NULL means "inherit the project cadence"
