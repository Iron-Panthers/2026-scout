-- Epic 1% and Legendary 0.1% per card (were 0.1% and 0.01%); Uncommon and Rare unchanged,
-- Common takes up the difference: 78.9%.
UPDATE tcg_packs
SET odds = '{"common": 0.789, "uncommon": 0.15, "rare": 0.05, "double_rare": 0.01, "ultra_rare": 0.001}'
WHERE id = 'mttd26';
