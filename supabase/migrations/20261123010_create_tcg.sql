-- TCG: trading card packs in the Shop. A pack holds cards of individual teams; opening one
-- costs points and adds cards to the user's binder (duplicates counted). Packs and cards are
-- rows here so new sets need no app update; opening happens in open_tcg_pack() so the roll,
-- the payment and the cards are one step nobody can fake from the browser.

CREATE TABLE IF NOT EXISTS tcg_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cost INTEGER NOT NULL CHECK (cost >= 0),
  cards_per_pack INTEGER NOT NULL CHECK (cards_per_pack BETWEEN 1 AND 20),
  -- Chance of each rarity per card; must sum to 1
  odds JSONB NOT NULL,
  -- Shown in the Shop while true
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tcg_cards (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES tcg_packs(id) ON DELETE CASCADE,
  -- Its number in the set ("12/34")
  number INTEGER NOT NULL,
  team_number INTEGER NOT NULL,
  team_name TEXT NOT NULL,
  location TEXT,
  image_url TEXT,
  rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'double_rare', 'ultra_rare')),
  UNIQUE (pack_id, number)
);

-- Each user's binder: how many of each card they've pulled
CREATE TABLE IF NOT EXISTS user_tcg_cards (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES tcg_cards(id) ON DELETE CASCADE,
  count INTEGER NOT NULL CHECK (count > 0),
  first_pulled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_id)
);

ALTER TABLE tcg_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tcg_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tcg_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can view packs" ON tcg_packs;
CREATE POLICY "Signed-in users can view packs" ON tcg_packs FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Signed-in users can view cards" ON tcg_cards;
CREATE POLICY "Signed-in users can view cards" ON tcg_cards FOR SELECT USING (auth.uid() IS NOT NULL);
-- Binders are on profiles, which anyone signed in can open; only open_tcg_pack() writes them
DROP POLICY IF EXISTS "Signed-in users can view binders" ON user_tcg_cards;
CREATE POLICY "Signed-in users can view binders" ON user_tcg_cards FOR SELECT USING (auth.uid() IS NOT NULL);

-- Opens a pack for the signed-in user: takes its cost from their points, rolls each card's
-- rarity by the pack's odds, picks a card of that rarity at random, and adds it to their binder.
-- Returns {"points": balance after, "cards": [{"card_id", "is_new"}, ...]} in pull order.
CREATE OR REPLACE FUNCTION open_tcg_pack(p_pack_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_pack tcg_packs%ROWTYPE;
  v_points INTEGER;
  v_roll DOUBLE PRECISION;
  v_rarity TEXT;
  v_card TEXT;
  v_new BOOLEAN;
  v_cards JSONB := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_pack FROM tcg_packs WHERE id = p_pack_id AND active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That pack isn''t available';
  END IF;

  -- Locked so two packs opened at once can't both spend the same points
  SELECT points INTO v_points FROM game_profiles WHERE user_id = v_user FOR UPDATE;
  IF v_points IS NULL OR v_points < v_pack.cost THEN
    RAISE EXCEPTION 'Not enough points. You need % but have %.', v_pack.cost, COALESCE(v_points, 0);
  END IF;
  UPDATE game_profiles SET points = points - v_pack.cost WHERE user_id = v_user
    RETURNING points INTO v_points;

  FOR i IN 1..v_pack.cards_per_pack LOOP
    -- The rarity whose share of the odds the roll lands in (rarest last)
    v_roll := random();
    SELECT o.rarity INTO v_rarity
    FROM (
      SELECT r.rarity, SUM((v_pack.odds ->> r.rarity)::numeric) OVER (ORDER BY r.ord) AS upto
      FROM (VALUES ('common', 1), ('uncommon', 2), ('rare', 3), ('double_rare', 4), ('ultra_rare', 5)) r(rarity, ord)
    ) o
    WHERE v_roll < o.upto
    ORDER BY o.upto
    LIMIT 1;

    SELECT id INTO v_card FROM tcg_cards
      WHERE pack_id = p_pack_id AND rarity = COALESCE(v_rarity, 'common')
      ORDER BY random() LIMIT 1;
    IF v_card IS NULL THEN
      -- Nothing of that rarity in this set: any card
      SELECT id INTO v_card FROM tcg_cards WHERE pack_id = p_pack_id ORDER BY random() LIMIT 1;
    END IF;
    IF v_card IS NULL THEN
      RAISE EXCEPTION 'That pack has no cards yet';
    END IF;

    INSERT INTO user_tcg_cards (user_id, card_id, count) VALUES (v_user, v_card, 1)
      ON CONFLICT (user_id, card_id) DO UPDATE SET count = user_tcg_cards.count + 1
      RETURNING (xmax = 0) INTO v_new;

    v_cards := v_cards || jsonb_build_object('card_id', v_card, 'is_new', v_new);
    v_card := NULL;
  END LOOP;

  RETURN jsonb_build_object('points', v_points, 'cards', v_cards);
END;
$$;

REVOKE ALL ON FUNCTION open_tcg_pack(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION open_tcg_pack(TEXT) TO authenticated;

-- The first set: 2026 Madtown Throwdown's 34 teams (no B-bots). Photos are the pit scouting
-- photos, or the team's TBA robot photo where there wasn't one (8768 and 9584 have neither).
-- Rarity follows event OPR: top 2 Ultra Rare, next 4 Double Rare, 7 Rare, 9 Uncommon, 12 Common.
INSERT INTO tcg_packs (id, name, cost, cards_per_pack, odds, sort_order)
VALUES ('mttd26', '2026 Madtown Throwdown', 100, 5,
  '{"common": 0.55, "uncommon": 0.25, "rare": 0.12, "double_rare": 0.06, "ultra_rare": 0.02}', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tcg_cards (id, pack_id, number, team_number, team_name, location, image_url, rarity) VALUES
  ('mttd26-01', 'mttd26', 1, 114, 'Eaglestrike', 'Los Altos, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/114/1794020005233.jpg', 'common'),
  ('mttd26-02', 'mttd26', 2, 254, 'The Cheesy Poofs', 'San Jose, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/254/1794019810125.jpg', 'ultra_rare'),
  ('mttd26-03', 'mttd26', 3, 581, 'Blazing Bulldogs', 'San Jose, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/581/1794068224254.jpg', 'double_rare'),
  ('mttd26-04', 'mttd26', 4, 649, 'MSET Fish', 'Saratoga, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/649/1794018580607.jpg', 'common'),
  ('mttd26-05', 'mttd26', 5, 841, 'The BioMechs', 'Richmond, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/841/1794088900805.jpg', 'double_rare'),
  ('mttd26-06', 'mttd26', 6, 971, 'Spartan Robotics', 'Mountain View, California', 'https://i.imgur.com/fzsuZ2I.jpeg', 'rare'),
  ('mttd26-07', 'mttd26', 7, 973, 'Greybots', 'Atascadero, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/973/1794089468801.jpg', 'uncommon'),
  ('mttd26-08', 'mttd26', 8, 1323, 'MadTown Robotics', 'Madera, California', 'https://i.imgur.com/R6IoG5z.jpeg', 'double_rare'),
  ('mttd26-09', 'mttd26', 9, 1538, 'The Holy Cows', 'San Diego, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/1538/1794068127483.jpg', 'uncommon'),
  ('mttd26-10', 'mttd26', 10, 1671, 'Buchanan Bird Brains', 'Clovis, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/1671/1794065740909.jpg', 'common'),
  ('mttd26-11', 'mttd26', 11, 1678, 'Citrus Circuits', 'Davis, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/1678/1794066757327.jpg', 'rare'),
  ('mttd26-12', 'mttd26', 12, 1868, 'Space Cookies', 'Mountain View, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/1868/1794021402267.jpg', 'rare'),
  ('mttd26-13', 'mttd26', 13, 2073, 'EagleForce', 'Elk Grove, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/2073/1794067761756.jpg', 'rare'),
  ('mttd26-14', 'mttd26', 14, 2135, 'Presentation Invasion', 'San Jose, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/2135/1794088668586.jpg', 'uncommon'),
  ('mttd26-15', 'mttd26', 15, 2813, 'Gear Heads', 'Saratoga, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/2813/1794019474655.jpg', 'common'),
  ('mttd26-16', 'mttd26', 16, 3256, 'WarriorBorgs', 'San Jose, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/3256/1794067346409.jpg', 'common'),
  ('mttd26-17', 'mttd26', 17, 3970, 'Duncan Dynamics', 'Fresno, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/3970/1794070679347.jpg', 'uncommon'),
  ('mttd26-18', 'mttd26', 18, 4414, 'HighTide', 'Ventura, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/4414/1794067524092.jpg', 'ultra_rare'),
  ('mttd26-19', 'mttd26', 19, 4635, 'PrepaTec - Botbusters', 'Monterrey, Nuevo León', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/4635/1794020302190.jpg', 'uncommon'),
  ('mttd26-20', 'mttd26', 20, 4698, 'Raider Robotics', 'Sacramento, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/4698/1794087672423.jpg', 'rare'),
  ('mttd26-21', 'mttd26', 21, 5026, 'Iron Panthers', 'Burlingame, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/5026/1794090006001.jpg', 'rare'),
  ('mttd26-22', 'mttd26', 22, 5817, 'Uni-Rex', 'Fresno, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/5817/1794023882364.jpg', 'uncommon'),
  ('mttd26-23', 'mttd26', 23, 5924, 'Golden Gate Robotics', 'San Francisco, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/5924/1794067769219.jpg', 'uncommon'),
  ('mttd26-24', 'mttd26', 24, 5940, 'BREAD', 'Redwood City, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/5940/1794017814525.jpg', 'double_rare'),
  ('mttd26-25', 'mttd26', 25, 6305, 'Stable Circuits', 'Fresno, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/6305/1794019032471.jpg', 'common'),
  ('mttd26-26', 'mttd26', 26, 6619, 'GravitechX', 'Livermore, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/6619/1794068989995.jpg', 'common'),
  ('mttd26-27', 'mttd26', 27, 6657, 'Arborbotics', 'Visalia, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/6657/1794070348022.jpg', 'common'),
  ('mttd26-28', 'mttd26', 28, 7419, 'TECH Support', 'Dublin, California', 'https://i.imgur.com/h4BQjIy.jpeg', 'uncommon'),
  ('mttd26-29', 'mttd26', 29, 7421, 'PrepaTec - OVERTURE', 'Monterrey, Nuevo León', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/7421/1794017753434.jpg', 'uncommon'),
  ('mttd26-30', 'mttd26', 30, 8033, 'Highlander Robotics', 'Piedmont, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/8033/1794023627461.jpg', 'rare'),
  ('mttd26-31', 'mttd26', 31, 8048, 'East Palo Alto ChurroBots', 'East Palo Alto, California', 'https://qwzsrlbhwigozonzthvx.supabase.co/storage/v1/object/public/pit-scouting-photos/2026mttd/8048/1794018865625.jpg', 'common'),
  ('mttd26-32', 'mttd26', 32, 8768, 'Titan Robotics', 'Fresno, California', NULL, 'common'),
  ('mttd26-33', 'mttd26', 33, 9470, 'Ctrl-Alt-Defeat', 'Fremont, California', 'https://i.imgur.com/EcZPt3X.jpeg', 'common'),
  ('mttd26-34', 'mttd26', 34, 9584, 'Spartan Squared', 'Mountain View, California', NULL, 'common')
ON CONFLICT (id) DO NOTHING;
