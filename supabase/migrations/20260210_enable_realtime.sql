-- Enable Realtime for match assignments feature
-- This allows the app to receive instant notifications when matches/assignments change

-- Add matches table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE matches;

-- Add match_assignment_notifications table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE match_assignment_notifications;

-- Verify it worked (optional - just for checking)
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
