-- Track which event each owned event-currency cosmetic was purchased from,
-- so the Shop can label it (e.g. "From Chezy Champs 2026"). Map of
-- cosmetic id -> event name, populated at purchase time.
ALTER TABLE game_profiles
  ADD COLUMN IF NOT EXISTS event_cosmetic_sources JSONB NOT NULL DEFAULT '{}';
