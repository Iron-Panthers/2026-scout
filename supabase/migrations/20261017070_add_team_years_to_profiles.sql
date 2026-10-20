-- The seasons a scouter was on the team, entered on their profile page.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS team_years SMALLINT[] NOT NULL DEFAULT '{}';

-- get_public_profile (20261017060) now also returns team_years. Its return columns
-- change, so it has to be dropped and recreated rather than replaced.
DROP FUNCTION IF EXISTS get_public_profile(UUID);
CREATE FUNCTION get_public_profile(p_user UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  avatar_url TEXT,
  role TEXT,
  is_manager BOOLEAN,
  created_at TIMESTAMPTZ,
  equipped_cosmetics JSONB,
  team_years SMALLINT[]
) AS $$
  SELECT
    p.id,
    COALESCE(NULLIF(p.name, ''), 'Unknown'),
    p.avatar_url,
    p.role,
    COALESCE(p.is_manager, false),
    p.created_at,
    COALESCE(to_jsonb(g.equipped_cosmetics), '{}'::jsonb),
    COALESCE(p.team_years, '{}')
  FROM profiles p
  LEFT JOIN game_profiles g ON g.user_id = p.id
  WHERE auth.uid() IS NOT NULL AND p.id = p_user;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_public_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_profile(UUID) TO authenticated;
