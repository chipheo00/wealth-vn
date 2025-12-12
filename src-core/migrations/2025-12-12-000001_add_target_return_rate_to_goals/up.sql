-- Add target_return_rate column to goals table (if it doesn't already exist)
-- The goals table should have: id, title, description, target_amount, is_achieved, target_return_rate
-- This is a no-op if the column already exists
ALTER TABLE goals ADD COLUMN target_return_rate DOUBLE DEFAULT NULL;
