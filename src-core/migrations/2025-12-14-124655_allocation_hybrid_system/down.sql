-- Rollback: Remove allocation_versions table
DROP TABLE IF EXISTS allocation_versions;

-- Drop indices
DROP INDEX IF EXISTS idx_allocation_versions_allocation_id;
DROP INDEX IF EXISTS idx_allocation_versions_dates;

-- Remove columns from goals_allocation
-- Note: SQLite 3.35.0+ supports ALTER TABLE DROP COLUMN
-- For older versions, you may need to recreate the table
-- This is left as a no-op for safety with older SQLite versions
