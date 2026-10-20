-- Competitions a scouter says they were a scouting manager at, marked from the
-- "Incorrect?" dialog under the map on their profile. Works for any event on their map
-- (ones the app recorded and ones they added), keyed by TBA event code.
CREATE TABLE IF NOT EXISTS scouting_manager_events (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_code TEXT NOT NULL,           -- TBA event key, e.g. "2024casj" (starts with the season)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_code)
);

ALTER TABLE scouting_manager_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view scouting manager events" ON scouting_manager_events;
CREATE POLICY "Authenticated users can view scouting manager events"
  ON scouting_manager_events FOR SELECT USING (auth.uid() IS NOT NULL);

-- Mark your own, only for seasons you were on the team (the event code's leading year
-- must be in profiles.team_years)
DROP POLICY IF EXISTS "Users can mark events from their team years" ON scouting_manager_events;
CREATE POLICY "Users can mark events from their team years"
  ON scouting_manager_events FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND event_code ~ '^[0-9]{4}'
    AND substring(event_code FROM 1 FOR 4)::SMALLINT = ANY (
      COALESCE((SELECT team_years FROM profiles WHERE id = auth.uid()), '{}'::SMALLINT[])
    )
  );

DROP POLICY IF EXISTS "Users can unmark their events" ON scouting_manager_events;
CREATE POLICY "Users can unmark their events"
  ON scouting_manager_events FOR DELETE USING (auth.uid() = user_id);
