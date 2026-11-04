-- Match videos cut from an event's livestream, for matches The Blue Alliance has no video of.
-- A manager adds the livestream's YouTube link; the scan-livestream edge function starts the
-- livestream-clips GitHub Actions workflow, which reads each match's name and clock off the
-- broadcast overlay and saves where every match it finds starts and ends.

CREATE TABLE IF NOT EXISTS event_livestreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  video_id TEXT NOT NULL,
  -- queued: waiting for the workflow; processing: being scanned; done / failed: finished
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  -- Why the scan failed, worded for the manager
  error TEXT,
  matches_found INTEGER,
  added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (event_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_event_livestreams_event_id ON event_livestreams(event_id);

-- One clip per match: a later scan that finds the match again replaces it
CREATE TABLE IF NOT EXISTS match_video_clips (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- TBA's match key without the event: "qm68", "sf5m1" (playoff match 5), "f1m2" (final 2)
  match_key TEXT NOT NULL,
  livestream_id UUID NOT NULL REFERENCES event_livestreams(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  start_seconds INTEGER NOT NULL CHECK (start_seconds >= 0),
  end_seconds INTEGER NOT NULL CHECK (end_seconds > start_seconds),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, match_key)
);

ALTER TABLE event_livestreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_video_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone signed in can see livestreams" ON event_livestreams;
CREATE POLICY "Anyone signed in can see livestreams" ON event_livestreams FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Managers add and remove livestreams (scans are started, and their results written, by the
-- edge function and workflow with the service role)
DROP POLICY IF EXISTS "Managers can add livestreams" ON event_livestreams;
CREATE POLICY "Managers can add livestreams" ON event_livestreams FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true));

DROP POLICY IF EXISTS "Managers can remove livestreams" ON event_livestreams;
CREATE POLICY "Managers can remove livestreams" ON event_livestreams FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true));

DROP POLICY IF EXISTS "Anyone signed in can see match clips" ON match_video_clips;
CREATE POLICY "Anyone signed in can see match clips" ON match_video_clips FOR SELECT
  USING (auth.uid() IS NOT NULL);
