-- New odds for the 2026 Madtown Throwdown pack (hidden from players by 20261124030).
--
-- Asked for: Common 80%, Uncommon 15%, Rare 5%, Epic 0.1%, Legendary 0.01%. Those add up to
-- 100.11%, and a roll past 100% never happens (Epic and Legendary would never be pulled), so
-- Common gives up the extra 0.11%: 79.89%.
UPDATE tcg_packs
SET odds = '{"common": 0.7989, "uncommon": 0.15, "rare": 0.05, "double_rare": 0.001, "ultra_rare": 0.0001}'
WHERE id = 'mttd26';

-- Dev mode rolls its sandbox packs in the browser, so developers can still get the odds
CREATE OR REPLACE FUNCTION get_tcg_pack_odds(p_pack_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_developer() THEN
    RAISE EXCEPTION 'Only developers can see pack odds';
  END IF;
  RETURN (SELECT odds FROM tcg_packs WHERE id = p_pack_id);
END;
$$;

REVOKE ALL ON FUNCTION get_tcg_pack_odds(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_tcg_pack_odds(TEXT) TO authenticated;
