-- Keep enough on each event_leaderboards row to draw the profile page's map of events
-- scouted, even after the event (and every submission) is deleted: where and when the
-- event was, and how many matches the scouter scouted there.
ALTER TABLE event_leaderboards
  ADD COLUMN IF NOT EXISTS event_location TEXT,
  ADD COLUMN IF NOT EXISTS event_end_date DATE,
  -- Distinct matches with a match or qual submission; NULL on rows saved before this
  -- column existed (those events were already deleted, so it can't be recounted)
  ADD COLUMN IF NOT EXISTS matches_scouted INTEGER;

-- Same as before (20261015010_create_event_leaderboards.sql), now also saving the
-- event's location and end date and each scouter's distinct matches scouted.
CREATE OR REPLACE FUNCTION snapshot_event_leaderboard(p_event_id UUID)
RETURNS VOID AS $$
DECLARE
  ev events%ROWTYPE;
BEGIN
  SELECT * INTO ev FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM event_leaderboards WHERE event_id = p_event_id;

  INSERT INTO event_leaderboards
    (event_id, scouter_id, event_code, event_name, event_location, event_start_date, event_end_date,
     scouter_name, submission_count, matches_scouted, points)
  SELECT
    p_event_id, c.scouter_id, ev.event_code, ev.name, ev.location, ev.start_date, ev.end_date,
    COALESCE(NULLIF(p.name, ''), 'Unknown'), c.cnt, COALESCE(mc.matches, 0), COALESCE(g.points, 0)
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
  LEFT JOIN (
    SELECT scouter_id, COUNT(DISTINCT match_id)::INTEGER AS matches FROM (
      SELECT s.scouter_id, s.match_id FROM scouting_submissions s
        JOIN matches m ON m.id = s.match_id WHERE m.event_id = p_event_id
      UNION ALL
      SELECT s.scouter_id, s.match_id FROM qual_scouting_submissions s
        JOIN matches m ON m.id = s.match_id WHERE m.event_id = p_event_id
    ) match_subs
    WHERE scouter_id IS NOT NULL
    GROUP BY scouter_id
  ) mc ON mc.scouter_id = c.scouter_id
  LEFT JOIN profiles p ON p.id = c.scouter_id
  LEFT JOIN game_profiles g ON g.user_id = c.scouter_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION snapshot_event_leaderboard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION snapshot_event_leaderboard(UUID) TO authenticated;

-- Fill the new columns in for events that still exist.
SELECT snapshot_event_leaderboard(id) FROM events;
