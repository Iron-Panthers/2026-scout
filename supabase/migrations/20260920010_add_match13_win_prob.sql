-- Match predictions now come from match13 instead of Statbotics (see
-- sync-match-results edge function). Add a dedicated column rather than
-- reusing statbotics_red_win_prob so the column name still reflects its
-- actual source; the old column is left in place, unused, rather than
-- dropped.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS match13_red_win_prob FLOAT
    CHECK (match13_red_win_prob IS NULL OR (match13_red_win_prob >= 0 AND match13_red_win_prob <= 1));
