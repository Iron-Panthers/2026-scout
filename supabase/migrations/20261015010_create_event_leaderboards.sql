-- Permanent per-event scouter leaderboards.
--
-- One row per (event, scouter). Deliberately has NO foreign key to events or
-- profiles, so rows survive the event being deleted (which cascades through
-- matches and every submission table). Event details and the scouter's name are
-- copied in so past leaderboards stay readable on their own.
--
-- Rows are written by snapshot_event_leaderboard(), which counts a scouter's
-- match, qual and pit submissions for the event and copies their current
-- game_profiles.points balance. It runs:
--   * whenever the Leaderboard tab opens an existing event (keeps it fresh), and
--   * from a BEFORE DELETE trigger on events, so the final standings are saved
--     no matter how the event is deleted.
-- It's SECURITY DEFINER because game_profiles RLS hides other users' balances.

CREATE TABLE IF NOT EXISTS event_leaderboards (
  event_id UUID NOT NULL,
  scouter_id UUID NOT NULL,
  event_code TEXT,
  event_name TEXT NOT NULL,
  event_start_date DATE,
  scouter_name TEXT NOT NULL DEFAULT 'Unknown',
  submission_count INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, scouter_id)
);

CREATE INDEX IF NOT EXISTS idx_event_leaderboards_event ON event_leaderboards(event_id);

ALTER TABLE event_leaderboards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view event leaderboards" ON event_leaderboards;
CREATE POLICY "Authenticated users can view event leaderboards"
  ON event_leaderboards FOR SELECT USING (auth.uid() IS NOT NULL);
-- No insert/update/delete policies: only snapshot_event_leaderboard() writes.

CREATE OR REPLACE FUNCTION snapshot_event_leaderboard(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  ev events%ROWTYPE;
BEGIN
  SELECT * INTO ev FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM event_leaderboards WHERE event_id = p_event_id;

  INSERT INTO event_leaderboards
    (event_id, scouter_id, event_code, event_name, event_start_date, scouter_name, submission_count, points)
  SELECT
    p_event_id, c.scouter_id, ev.event_code, ev.name, ev.start_date,
    COALESCE(NULLIF(p.name, ''), 'Unknown'), c.cnt, COALESCE(g.points, 0)
  FROM (
    SELECT scouter_id, COUNT(*)::INTEGER AS cnt FROM (
      SELECT s.scouter_id FROM scouting_submissions s
        JOIN matches m ON m.id = s.match_id WHERE m.event_id = p_event_id
      UNION ALL
      SELECT s.scouter_id FROM qual_scouting_submissions s
        JOIN matches m ON m.id = s.match_id WHERE m.event_id = p_event_id
      UNION ALL
      SELECT s.scouter_id FROM pit_scouting_submissions s WHERE s.event_id = p_event_id
    ) all_subs
    WHERE scouter_id IS NOT NULL
    GROUP BY scouter_id
  ) c
  LEFT JOIN profiles p ON p.id = c.scouter_id
  LEFT JOIN game_profiles g ON g.user_id = c.scouter_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION snapshot_event_leaderboard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION snapshot_event_leaderboard(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION snapshot_event_leaderboard_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM snapshot_event_leaderboard(OLD.id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS events_snapshot_leaderboard ON events;
CREATE TRIGGER events_snapshot_leaderboard
  BEFORE DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION snapshot_event_leaderboard_on_delete();

-- Save standings for events that already exist.
SELECT snapshot_event_leaderboard(id) FROM events;
