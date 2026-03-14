ALTER TABLE scouting_submissions
ADD COLUMN IF NOT EXISTS tba_data JSONB DEFAULT NULL;

COMMENT ON COLUMN scouting_submissions.tba_data IS
  'TBA-sourced data (e.g. {"climb": "Level3"}). Populated by fetch-tba-climb-data cron.';
