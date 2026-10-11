-- Settle a match's pending bets server-side, in one transaction.
--
-- Settlement used to run entirely in the browser: mark each bet won/lost, then
-- add the payout to the winner's game_profiles row. RLS only lets managers
-- update other users' bets, so for a scout the bet update was silently
-- rejected while the update to their own balance went through — the bet stayed
-- "pending" and every reload of the betting page paid it out again.
--
-- This function claims each bet (pending → won/lost) and credits the payout in
-- the same transaction, and only credits bets it actually moved out of
-- "pending", so repeated or concurrent calls can never pay a bet twice.
--
-- The payout math mirrors payoutMultiplier / computeTimeDecayFactor / calcPayout
-- in src/lib/betting.ts (still used client-side for payout estimates) — keep
-- them in sync.

CREATE OR REPLACE FUNCTION bet_payout_multiplier(p DOUBLE PRECISION)
RETURNS DOUBLE PRECISION AS $$
DECLARE
  c DOUBLE PRECISION := LEAST(1, GREATEST(0, p));
BEGIN
  IF c <= 0.3 THEN RETURN 1.8  + ((c - 0)   / (0.3 - 0))   * (1.55 - 1.8);
  ELSIF c <= 0.5 THEN RETURN 1.55 + ((c - 0.3) / (0.5 - 0.3)) * (1.32 - 1.55);
  ELSIF c <= 0.7 THEN RETURN 1.32 + ((c - 0.5) / (0.7 - 0.5)) * (1.1 - 1.32);
  ELSE RETURN 1.1 + ((c - 0.7) / (1 - 0.7)) * (1.05 - 1.1);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION bet_time_decay_factor(bet_created_at TIMESTAMPTZ, pred_time TIMESTAMPTZ)
RETURNS DOUBLE PRECISION AS $$
DECLARE
  full_value_ms CONSTANT DOUBLE PRECISION := 60 * 60 * 1000;
  remaining_ms DOUBLE PRECISION;
BEGIN
  IF pred_time IS NULL THEN RETURN 1.0; END IF;
  remaining_ms := EXTRACT(EPOCH FROM (pred_time - bet_created_at)) * 1000;
  IF remaining_ms <= 0 THEN RETURN 0; END IF;
  IF remaining_ms >= full_value_ms THEN RETURN 1.0; END IF;
  RETURN sqrt(remaining_ms / full_value_ms);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION bet_payout(
  amount INTEGER,
  winner_pool INTEGER,
  total_pool INTEGER,
  winner_predicted_prob DOUBLE PRECISION,
  time_decay_factor DOUBLE PRECISION
)
RETURNS INTEGER AS $$
DECLARE
  decay_scale DOUBLE PRECISION;
  input_percent DOUBLE PRECISION;
BEGIN
  IF amount <= 0 OR winner_pool <= 0 THEN RETURN amount; END IF;
  decay_scale := LEAST(1, GREATEST(time_decay_factor * 0.2 + 0.8, 0));
  input_percent := (amount::DOUBLE PRECISION / winner_pool) * decay_scale;
  RETURN GREATEST(
    floor(input_percent * total_pool * bet_payout_multiplier(winner_predicted_prob))::INTEGER,
    amount + 10
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION settle_match_bets(
  p_match_id UUID,
  p_winner TEXT,
  p_red_win_prob DOUBLE PRECISION DEFAULT 0.5
)
RETURNS VOID AS $$
DECLARE
  v_match RECORD;
  v_winner TEXT;
  v_red_win_prob DOUBLE PRECISION;
  v_p_winner DOUBLE PRECISION;
  v_currency TEXT;
  v_red_total INTEGER;
  v_blue_total INTEGER;
  v_winner_pool INTEGER;
  v_bet RECORD;
  v_status TEXT;
  v_payout INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the match row so concurrent settlements of this match run one at a time.
  SELECT winning_alliance, pred_time, match13_red_win_prob
    INTO v_match
    FROM matches
    WHERE id = p_match_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  -- A stored winner (e.g. from sync-match-results) is authoritative.
  v_winner := COALESCE(v_match.winning_alliance, p_winner);
  IF v_winner NOT IN ('red', 'blue', 'tie') THEN
    RAISE EXCEPTION 'Invalid winner: %', v_winner;
  END IF;

  IF v_match.winning_alliance IS NULL THEN
    UPDATE matches SET winning_alliance = v_winner WHERE id = p_match_id;
  END IF;

  -- Prefer the prediction stored on the match so every caller settles with the same odds.
  v_red_win_prob := LEAST(1, GREATEST(0, COALESCE(v_match.match13_red_win_prob, p_red_win_prob, 0.5)));
  v_p_winner := CASE v_winner
    WHEN 'red' THEN v_red_win_prob
    WHEN 'blue' THEN 1 - v_red_win_prob
    ELSE 0.5
  END;

  -- Points and event-points bets form entirely separate parimutuel pools.
  FOREACH v_currency IN ARRAY ARRAY['points', 'event'] LOOP
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE alliance = 'red'), 0),
      COALESCE(SUM(amount) FILTER (WHERE alliance = 'blue'), 0)
      INTO v_red_total, v_blue_total
      FROM bets
      WHERE match_id = p_match_id AND currency = v_currency AND status = 'pending';

    v_winner_pool := CASE WHEN v_winner = 'red' THEN v_red_total ELSE v_blue_total END;

    FOR v_bet IN
      SELECT id, user_id, alliance, amount, created_at
        FROM bets
        WHERE match_id = p_match_id AND currency = v_currency AND status = 'pending'
        FOR UPDATE
    LOOP
      IF v_winner = 'tie' THEN
        -- Refund on tie (no time decay on refunds)
        v_status := 'won';
        v_payout := v_bet.amount;
      ELSIF v_bet.alliance = v_winner THEN
        v_status := 'won';
        v_payout := bet_payout(
          v_bet.amount,
          v_winner_pool,
          v_red_total + v_blue_total,
          v_p_winner,
          bet_time_decay_factor(v_bet.created_at, v_match.pred_time)
        );
      ELSE
        v_status := 'lost';
        v_payout := 0;
      END IF;

      UPDATE bets SET status = v_status, payout = v_payout
        WHERE id = v_bet.id AND status = 'pending';

      IF FOUND AND v_payout > 0 THEN
        IF v_currency = 'event' THEN
          UPDATE game_profiles SET event_points = event_points + v_payout WHERE user_id = v_bet.user_id;
        ELSE
          UPDATE game_profiles SET points = points + v_payout WHERE user_id = v_bet.user_id;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION settle_match_bets(UUID, TEXT, DOUBLE PRECISION) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settle_match_bets(UUID, TEXT, DOUBLE PRECISION) TO authenticated;
