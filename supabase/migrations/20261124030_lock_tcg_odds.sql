-- Players can read everything about a pack but its odds: the Shop no longer shows them, and
-- open_tcg_pack (and get_tcg_pack_odds, for developers) read them on the server.
-- Apply together with the app update that stops reading tcg_packs.odds; the app before it
-- selects the column and its TCG tab would come up empty.
REVOKE SELECT ON tcg_packs FROM anon, authenticated;
GRANT SELECT (id, name, cost, cards_per_pack, active, sort_order, created_at) ON tcg_packs TO authenticated;
