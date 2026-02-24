-- Enable Realtime for matches table
ALTER PUBLICATION supabase_realtime ADD TABLE matches;

-- Function to notify when a user is assigned to a match
CREATE OR REPLACE FUNCTION notify_match_assignment()
RETURNS TRIGGER AS $$
DECLARE
  scouter_columns TEXT[] := ARRAY[
    'red1_scouter_id', 'red2_scouter_id', 'red3_scouter_id', 'qual_red_scouter_id',
    'blue1_scouter_id', 'blue2_scouter_id', 'blue3_scouter_id', 'qual_blue_scouter_id'
  ];
  col TEXT;
  old_value UUID;
  new_value UUID;
BEGIN
  -- Loop through each scouter column
  FOREACH col IN ARRAY scouter_columns
  LOOP
    -- Get old and new values dynamically
    EXECUTE format('SELECT ($1).%I', col) INTO old_value USING OLD;
    EXECUTE format('SELECT ($1).%I', col) INTO new_value USING NEW;

    -- If the scouter changed from NULL to a user_id, or changed to a different user
    IF (old_value IS NULL AND new_value IS NOT NULL) OR
       (old_value IS NOT NULL AND new_value IS NOT NULL AND old_value <> new_value) THEN

      -- Insert a notification record (we'll create this table next)
      INSERT INTO match_assignment_notifications (
        user_id,
        match_id,
        role,
        created_at
      ) VALUES (
        new_value,
        NEW.id,
        col,
        NOW()
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create table to track assignment notifications
CREATE TABLE IF NOT EXISTS match_assignment_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE match_assignment_notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own assignment notifications"
  ON match_assignment_notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX idx_match_assignments_user_notified
  ON match_assignment_notifications(user_id, notified);

-- Create trigger on matches table
DROP TRIGGER IF EXISTS on_match_assignment ON matches;
CREATE TRIGGER on_match_assignment
  AFTER INSERT OR UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION notify_match_assignment();

-- Enable Realtime for the notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE match_assignment_notifications;
