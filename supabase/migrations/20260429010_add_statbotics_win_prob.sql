-- Store the Statbotics win probability in the matches table.
-- This reduces reliance on the Statbotics API — the edge function writes it
-- when it successfully fetches predictions, and the client falls back to this
-- value when the API is unavailable or rate-limited.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS statbotics_red_win_prob FLOAT
    CHECK (statbotics_red_win_prob IS NULL OR (statbotics_red_win_prob >= 0 AND statbotics_red_win_prob <= 1));
