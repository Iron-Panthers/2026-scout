-- Add red_score and blue_score to matches table so scores fetched from TBA/Statbotics
-- can be cached in the DB, avoiding repeated API calls and eliminating -1 display issues.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS red_score integer,
  ADD COLUMN IF NOT EXISTS blue_score integer;
