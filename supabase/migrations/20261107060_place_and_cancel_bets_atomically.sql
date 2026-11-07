-- Placing a bet took the stake in a separate request from the browser, after reading the
-- balance first: anything else that wrote the balance in between (another tab, a reward, the
-- shop) could overwrite the deduction, so the stake wasn't really gone until settlement. These
-- take or refund the stake in the same transaction as the bet itself, against a locked
-- balance, so a placed bet has always been paid for.

CREATE OR REPLACE FUNCTION place_bet(p_match_id UUID, p_alliance TEXT, p_amount INTEGER, p_currency TEXT DEFAULT 'points')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_balance INTEGER;
  v_bet_id UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_currency NOT IN ('points', 'event') THEN
    RAISE EXCEPTION 'Invalid currency: %', p_currency;
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Bet an amount above 0';
  END IF;

  -- Locked, so concurrent bets and other balance writes wait their turn
  SELECT CASE WHEN p_currency = 'event' THEN event_points ELSE points END
    INTO v_balance
    FROM game_profiles
    WHERE user_id = v_user
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not load your game profile';
  END IF;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Not enough % — you have %', CASE WHEN p_currency = 'event' THEN 'event points' ELSE 'points' END, v_balance;
  END IF;

  IF EXISTS (SELECT 1 FROM matches WHERE id = p_match_id AND winning_alliance IS NOT NULL) THEN
    RAISE EXCEPTION 'This match has already been settled';
  END IF;
  IF EXISTS (SELECT 1 FROM bets WHERE match_id = p_match_id AND user_id = v_user AND currency = p_currency AND status = 'pending') THEN
    RAISE EXCEPTION 'You already have an active bet on this match';
  END IF;

  -- The bets table's own checks (alliance, the 10,000 cap) still apply
  INSERT INTO bets (user_id, match_id, alliance, amount, currency, status)
    VALUES (v_user, p_match_id, p_alliance, p_amount, p_currency, 'pending')
    RETURNING id INTO v_bet_id;

  IF p_currency = 'event' THEN
    UPDATE game_profiles SET event_points = event_points - p_amount WHERE user_id = v_user;
  ELSE
    UPDATE game_profiles SET points = points - p_amount WHERE user_id = v_user;
  END IF;

  RETURN v_bet_id;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_bet(p_bet_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Claimed pending → cancelled first, so a bet is only ever refunded once
  UPDATE bets SET status = 'cancelled'
    WHERE id = p_bet_id AND user_id = auth.uid() AND status = 'pending'
    RETURNING amount, currency INTO v_bet;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Can only cancel your own pending bets';
  END IF;

  IF v_bet.currency = 'event' THEN
    UPDATE game_profiles SET event_points = event_points + v_bet.amount WHERE user_id = auth.uid();
  ELSE
    UPDATE game_profiles SET points = points + v_bet.amount WHERE user_id = auth.uid();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION place_bet(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION place_bet(UUID, TEXT, INTEGER, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION cancel_bet(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_bet(UUID) TO authenticated;
