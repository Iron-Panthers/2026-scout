-- Create bets table for the match prediction market system.
-- Scouters wager their points on which alliance will win a match.
-- Uses a parimutuel system: winners split the total pool proportional to their stake.

CREATE TABLE IF NOT EXISTS bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  alliance TEXT NOT NULL CHECK (alliance IN ('red', 'blue')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'won', 'lost', 'cancelled')),
  -- payout is set when bet is settled; includes the original stake for won bets
  payout INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read bets (needed to compute live odds)
CREATE POLICY "Authenticated users can view all bets"
  ON bets FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can only create bets under their own user_id
CREATE POLICY "Users can create own bets"
  ON bets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can cancel their own pending bets (status → cancelled)
CREATE POLICY "Users can cancel own pending bets"
  ON bets FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (status = 'cancelled');

-- Managers can settle (update status/payout) on any bet
CREATE POLICY "Managers can settle bets"
  ON bets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_manager = true
    )
  );

CREATE INDEX idx_bets_user_id   ON bets(user_id);
CREATE INDEX idx_bets_match_id  ON bets(match_id);
CREATE INDEX idx_bets_status    ON bets(status);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_bets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bets_updated_at
  BEFORE UPDATE ON bets
  FOR EACH ROW EXECUTE FUNCTION update_bets_updated_at();
