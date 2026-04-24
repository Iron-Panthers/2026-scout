-- Add cosmetics columns to game_profiles
-- owned_cosmetics: array of purchased cosmetic IDs
-- equipped_cosmetics: JSON map of slot -> cosmetic ID (e.g. {"hat":"hat_crown","plant":"plant_cactus"})

ALTER TABLE game_profiles
  ADD COLUMN IF NOT EXISTS owned_cosmetics TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS equipped_cosmetics JSONB NOT NULL DEFAULT '{}';
