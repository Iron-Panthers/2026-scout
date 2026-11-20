-- Scouting a match pays once per scouter, however many times it's submitted. Resubmitting
-- replaced the submission (20261116010), but points could still be paid again: the app's
-- "already submitted?" check ran in the browser before saving, so a double submit, a
-- resubmit after the submission was deleted (by a manager, or a rescout replacing it), or the
-- same match under another robot all paid out again, and the insert trigger's 5 points came
-- with every new row.
--
-- match_point_awards records each payment, so each one happens at most once per scouter per
-- match:
--   'submission'  the 5 points the insert trigger gives for any submission
--   'match'       the 20 points + 10 event points the app gives for an assigned match

CREATE TABLE IF NOT EXISTS match_point_awards (
  scouter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('submission', 'match')),
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scouter_id, match_id, kind)
);

ALTER TABLE match_point_awards ENABLE ROW LEVEL SECURITY;
-- Written only by the functions below
DROP POLICY IF EXISTS "Users can view their own match point awards" ON match_point_awards;
CREATE POLICY "Users can view their own match point awards"
  ON match_point_awards FOR SELECT USING (auth.uid() = scouter_id);

-- Everything already submitted has been paid for (both kinds), so resubmitting it pays nothing
INSERT INTO match_point_awards (scouter_id, match_id, kind)
SELECT DISTINCT s.scouter_id, s.match_id, k.kind
FROM (
  SELECT scouter_id, match_id FROM scouting_submissions
  UNION
  SELECT scouter_id, match_id FROM qual_scouting_submissions
) s
JOIN auth.users u ON u.id = s.scouter_id
JOIN matches m ON m.id = s.match_id
CROSS JOIN (VALUES ('submission'), ('match')) k(kind)
WHERE s.scouter_id IS NOT NULL AND s.match_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- The insert trigger's 5 points: only for a scouter's first submission of a match
CREATE OR REPLACE FUNCTION award_points_on_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.scouter_id IS NULL OR NEW.match_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO match_point_awards (scouter_id, match_id, kind)
    VALUES (NEW.scouter_id, NEW.match_id, 'submission')
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN NEW; -- already paid for this match
  END IF;

  INSERT INTO game_profiles (user_id, points, unlocked_games)
  VALUES (NEW.scouter_id, 5, '{}')
  ON CONFLICT (user_id)
  DO UPDATE SET points = game_profiles.points + 5;

  RETURN NEW;
END;
$$;

-- The app's reward for scouting an assigned match (POINTS_PER_MATCH, EVENT_POINTS_PER_MATCH in
-- src/config/games.ts): paid once per match, in one statement. True if it paid now.
CREATE OR REPLACE FUNCTION award_match_points(p_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_match_id IS NULL OR NOT EXISTS (SELECT 1 FROM matches WHERE id = p_match_id) THEN
    RETURN false;
  END IF;

  INSERT INTO match_point_awards (scouter_id, match_id, kind)
    VALUES (auth.uid(), p_match_id, 'match')
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO game_profiles (user_id, points, event_points, unlocked_games)
  VALUES (auth.uid(), 20, 10, '{}')
  ON CONFLICT (user_id)
  DO UPDATE SET points = game_profiles.points + 20, event_points = game_profiles.event_points + 10;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION award_match_points(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION award_match_points(UUID) TO authenticated;
