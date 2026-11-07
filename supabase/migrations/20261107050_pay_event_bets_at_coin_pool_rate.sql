-- Event-currency bets now pay at the coin pool's rate for the match (see below), so they scale
-- like coin bets instead of paying little more than the stake from a pool of one or two
-- bettors. Mirrors calcPayout / settleMatchBets in src/lib/betting.ts.

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
  -- The coin pool, which event-currency bets are paid at the rate of
  v_coin_total INTEGER;
  v_coin_winner_pool INTEGER;
  v_rate_total INTEGER;
  v_rate_winner_pool INTEGER;
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

  -- Taken before the coin bets settle below
  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(amount) FILTER (WHERE alliance = v_winner), 0)
    INTO v_coin_total, v_coin_winner_pool
    FROM bets
    WHERE match_id = p_match_id AND currency = 'points' AND status = 'pending';

  -- Points and event-points bets are separate pools (each pays out in its own currency), but
  -- event bets are paid at the coin pool's rate: an event pool rarely has more than a bettor
  -- or two, so on its own a win would pay little more than the stake. With no coins on the
  -- winning side there's no coin rate, so the event pool's own is used.
  FOREACH v_currency IN ARRAY ARRAY['points', 'event'] LOOP
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE alliance = 'red'), 0),
      COALESCE(SUM(amount) FILTER (WHERE alliance = 'blue'), 0)
      INTO v_red_total, v_blue_total
      FROM bets
      WHERE match_id = p_match_id AND currency = v_currency AND status = 'pending';

    v_winner_pool := CASE WHEN v_winner = 'red' THEN v_red_total ELSE v_blue_total END;
    IF v_currency = 'event' AND v_coin_winner_pool > 0 THEN
      v_rate_winner_pool := v_coin_winner_pool;
      v_rate_total := v_coin_total;
    ELSE
      v_rate_winner_pool := v_winner_pool;
      v_rate_total := v_red_total + v_blue_total;
    END IF;

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
          v_rate_winner_pool,
          v_rate_total,
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
