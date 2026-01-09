-- Add is_active column to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN events.is_active IS 'Indicates if this is the currently active event. Only one event should be active at a time.';

-- Create a function to ensure only one active event
CREATE OR REPLACE FUNCTION ensure_single_active_event()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting this event to active, deactivate all other events
  IF NEW.is_active = true THEN
    UPDATE events
    SET is_active = false
    WHERE id != NEW.id AND is_active = true;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce single active event
DROP TRIGGER IF EXISTS trigger_single_active_event ON events;
CREATE TRIGGER trigger_single_active_event
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_active_event();

-- Add index for faster active event queries
CREATE INDEX IF NOT EXISTS idx_events_active ON events(is_active) WHERE is_active = true;
