-- Bets can now be staked with either the normal points balance or the
-- separate event_points balance (only allowed on the active event's own
-- matches, enforced client-side in src/lib/betting.ts placeBet()).
ALTER TABLE bets
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'points'
    CHECK (currency IN ('points', 'event'));
