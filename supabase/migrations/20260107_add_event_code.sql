-- Add event_code column to events table for The Blue Alliance integration
ALTER TABLE events
ADD COLUMN IF NOT EXISTS event_code TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN events.event_code IS 'The Blue Alliance event code (e.g., 2024cmp, 2024caln)';
