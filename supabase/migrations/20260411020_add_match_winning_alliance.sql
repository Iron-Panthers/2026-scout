-- Add winning_alliance column to matches table.
-- Set by managers when a match result is known; used to settle bets.
-- NULL means the match has not yet been settled.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS winning_alliance TEXT
    CHECK (winning_alliance IN ('red', 'blue', 'tie'));
