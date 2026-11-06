-- Off-season events often field a team's second (B, C, D or E) robot under an off-season
-- demo team number (e.g. 9991 for 581's B bot). Managers list those numbers per event, and
-- with convert_bbots on, the app shows each one with its main team's logo and its letter.
-- bbot_teams maps the demo number to the main team and letter: {"9991": "581B", ...}.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS convert_bbots BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bbot_teams JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_bbot_teams_object_check;
ALTER TABLE events
  ADD CONSTRAINT events_bbot_teams_object_check CHECK (jsonb_typeof(bbot_teams) = 'object');
