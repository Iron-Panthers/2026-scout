-- Number each set's cards by rarity: Commons first, the rarest last (highest numbers), and by
-- team number within a rarity. Card ids stay the same, so nobody's binder changes.
-- (Moved out of the way first: (pack_id, number) is unique, checked row by row.)
UPDATE tcg_cards SET number = number + 10000;

UPDATE tcg_cards c
SET number = r.n
FROM (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY pack_id
      ORDER BY array_position(ARRAY['common', 'uncommon', 'rare', 'double_rare', 'ultra_rare'], rarity), team_number
    ) AS n
  FROM tcg_cards
) r
WHERE c.id = r.id;
