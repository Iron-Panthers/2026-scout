-- Enable Realtime for match assignments and submissions feature
-- This allows the app to receive instant notifications when matches/assignments/submissions change

-- Add matches table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE matches;

-- Add match_assignment_notifications table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE match_assignment_notifications;

-- Add scouting_submissions table to realtime publication
-- This allows dashboards to update when submissions are created/updated
ALTER PUBLICATION supabase_realtime ADD TABLE scouting_submissions;

-- Verify it worked (optional - just for checking)
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
