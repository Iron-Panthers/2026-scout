-- Events a scouter says they attended/scouted at that the app has no record of (e.g.
-- before it was used, or never entered), added from the "Incorrect?" link under the map
-- on their profile. Shown on their map alongside the events the app recorded.
CREATE TABLE IF NOT EXISTS scouter_added_events (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_code TEXT NOT NULL,           -- TBA event key, e.g. "2024casj"
  event_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  -- How many matches they say they scouted there (optional)
  matches_scouted INTEGER CHECK (matches_scouted IS NULL OR matches_scouted BETWEEN 0 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_code)
);

ALTER TABLE scouter_added_events ENABLE ROW LEVEL SECURITY;

-- Visible to everyone signed in, like the rest of a profile's map
DROP POLICY IF EXISTS "Authenticated users can view added events" ON scouter_added_events;
CREATE POLICY "Authenticated users can view added events"
  ON scouter_added_events FOR SELECT USING (auth.uid() IS NOT NULL);

-- Add your own, only for seasons you were on the team (profiles.team_years)
DROP POLICY IF EXISTS "Users can add events from their team years" ON scouter_added_events;
CREATE POLICY "Users can add events from their team years"
  ON scouter_added_events FOR INSERT WITH CHECK (
    auth.uid() = user_id
    -- (a scalar subquery inside COALESCE, so ANY compares against the array's elements)
    AND EXTRACT(YEAR FROM start_date)::SMALLINT = ANY (
      COALESCE((SELECT team_years FROM profiles WHERE id = auth.uid()), '{}'::SMALLINT[])
    )
  );

-- Change the match count on your own added events
DROP POLICY IF EXISTS "Users can update their added events" ON scouter_added_events;
CREATE POLICY "Users can update their added events"
  ON scouter_added_events FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove their added events" ON scouter_added_events;
CREATE POLICY "Users can remove their added events"
  ON scouter_added_events FOR DELETE USING (auth.uid() = user_id);
