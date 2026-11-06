-- How many scouters hold each achievement, and how many scouters there are, for the
-- Achievements page. A function because profiles only lets you read your own row; it
-- returns counts only, never who holds what.
CREATE OR REPLACE FUNCTION get_achievement_holder_counts()
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'scouters', (SELECT count(*) FROM profiles),
    'holders', COALESCE(
      (SELECT jsonb_object_agg(achievement_id, holders)
       FROM (SELECT achievement_id, count(*) AS holders FROM user_achievements GROUP BY achievement_id) AS counts),
      '{}'::jsonb
    )
  )
  WHERE auth.uid() IS NOT NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_achievement_holder_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_achievement_holder_counts() TO authenticated;
