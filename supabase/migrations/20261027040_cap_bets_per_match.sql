-- A scouter can stake at most 10,000 on a single match (one bet per match; MAX_BET in
-- src/lib/betting.ts). Checked only when a bet is placed, so larger bets from before the
-- cap can still be settled or cancelled. (A NOT VALID check constraint would block those
-- updates too.)
CREATE OR REPLACE FUNCTION enforce_max_bet()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.amount > 10000 THEN
    RAISE EXCEPTION 'Bets are capped at 10,000 per match' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bets_max_amount ON bets;
CREATE TRIGGER bets_max_amount
  BEFORE INSERT ON bets
  FOR EACH ROW EXECUTE FUNCTION enforce_max_bet();
