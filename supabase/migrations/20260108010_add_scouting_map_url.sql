-- Add scouting_map_url column to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS scouting_map_url TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN events.scouting_map_url IS 'URL to the scouting map image for this event';
