-- Another user's profile as shown when you open it from Messages: name, picture, role,
-- join date and equipped cosmetics (never their email or settings). Goes through a
-- function because profiles / game_profiles policies only let you read your own row.
CREATE OR REPLACE FUNCTION get_public_profile(p_user UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  avatar_url TEXT,
  role TEXT,
  is_manager BOOLEAN,
  created_at TIMESTAMPTZ,
  equipped_cosmetics JSONB
) AS $$
  SELECT
    p.id,
    COALESCE(NULLIF(p.name, ''), 'Unknown'),
    p.avatar_url,
    p.role,
    COALESCE(p.is_manager, false),
    p.created_at,
    COALESCE(to_jsonb(g.equipped_cosmetics), '{}'::jsonb)
  FROM profiles p
  LEFT JOIN game_profiles g ON g.user_id = p.id
  WHERE auth.uid() IS NOT NULL AND p.id = p_user;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_public_profile(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_profile(UUID) TO authenticated;
