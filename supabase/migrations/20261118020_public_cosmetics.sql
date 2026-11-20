-- Anyone signed in can see another user's cosmetics on their profile (what they own and have
-- equipped), but not the rest of their game profile (coins, points, unlocked games), which
-- game_profiles' policies keep to themselves and managers.
CREATE OR REPLACE FUNCTION get_public_cosmetics(p_user UUID)
RETURNS TABLE (owned_cosmetics JSONB, equipped_cosmetics JSONB, event_cosmetic_sources JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(g.owned_cosmetics), to_jsonb(g.equipped_cosmetics), to_jsonb(g.event_cosmetic_sources)
  FROM game_profiles g
  WHERE g.user_id = p_user AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION get_public_cosmetics(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_public_cosmetics(UUID) TO authenticated;
