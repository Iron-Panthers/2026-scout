-- "Invent The Rest" demo event (2026-11-15): a replay of 2026 Madtown Throwdown's qual matches.
--
-- * Results are hidden: the event is `manual_results`, so nothing fills in a match's winner,
--   scores or start time (sync-match-results pulling from TBA, the match page caching TBA
--   scores, settling from a client-supplied winner) — only a manager revealing it through
--   reveal_match_result, which also settles everyone's bets on it.
-- * Its matches are new rows, so bets on the real Madtown matches don't touch its odds; they
--   start from the stored match13 predictions alone.
-- * Accounts created on its `signup_date` (Pacific time) join it automatically and start
--   with `signup_points` coins.
--
-- It shares Madtown's event code, so TBA team lists, match13 predictions and the Madcoins
-- currency carry over. It has no start date, so activating it keeps everyone's Madcoins
-- (see reset_event_points_for_new_event).

ALTER TABLE events ADD COLUMN IF NOT EXISTS manual_results BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS signup_date DATE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS signup_points INTEGER CHECK (signup_points IS NULL OR signup_points >= 0);

-- ---------------------------------------------------------------------------
-- Results only change through reveal_match_result on a manual-results event
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION keep_manual_match_results()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.revealing_result', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND manual_results) THEN
    NEW.winning_alliance := OLD.winning_alliance;
    NEW.red_score := OLD.red_score;
    NEW.blue_score := OLD.blue_score;
    -- TBA's real (past) start time would close betting
    NEW.pred_time := OLD.pred_time;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_keep_manual_results ON matches;
CREATE TRIGGER matches_keep_manual_results
  BEFORE UPDATE OF winning_alliance, red_score, blue_score, pred_time ON matches
  FOR EACH ROW
  EXECUTE FUNCTION keep_manual_match_results();

-- ---------------------------------------------------------------------------
-- settle_match_bets: on a manual-results event, only a revealed winner settles
-- (otherwise a client could settle by passing TBA's real winner). Same as
-- 20261107050_pay_event_bets_at_coin_pool_rate.sql apart from that check.
-- ---------------------------------------------------------------------------
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

  SELECT m.winning_alliance, m.pred_time, m.match13_red_win_prob, COALESCE(e.manual_results, false) AS manual_results
    INTO v_match
    FROM matches m
    LEFT JOIN events e ON e.id = m.event_id
    WHERE m.id = p_match_id
    FOR UPDATE OF m;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.manual_results AND v_match.winning_alliance IS NULL THEN
    RAISE EXCEPTION 'This match''s result hasn''t been revealed yet';
  END IF;

  v_winner := COALESCE(v_match.winning_alliance, p_winner);
  IF v_winner NOT IN ('red', 'blue', 'tie') THEN
    RAISE EXCEPTION 'Invalid winner: %', v_winner;
  END IF;

  IF v_match.winning_alliance IS NULL THEN
    UPDATE matches SET winning_alliance = v_winner WHERE id = p_match_id;
  END IF;

  v_red_win_prob := LEAST(1, GREATEST(0, COALESCE(v_match.match13_red_win_prob, p_red_win_prob, 0.5)));
  v_p_winner := CASE v_winner
    WHEN 'red' THEN v_red_win_prob
    WHEN 'blue' THEN 1 - v_red_win_prob
    ELSE 0.5
  END;

  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(amount) FILTER (WHERE alliance = v_winner), 0)
    INTO v_coin_total, v_coin_winner_pool
    FROM bets
    WHERE match_id = p_match_id AND currency = 'points' AND status = 'pending';

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

-- ---------------------------------------------------------------------------
-- A manager reveals a manual-results match: stores the score and settles every bet on it
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reveal_match_result(p_match_id UUID, p_red_score INTEGER, p_blue_score INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match RECORD;
  v_winner TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_manager) THEN
    RAISE EXCEPTION 'Only managers can reveal results';
  END IF;
  IF p_red_score IS NULL OR p_blue_score IS NULL OR p_red_score < 0 OR p_blue_score < 0 THEN
    RAISE EXCEPTION 'Enter both scores';
  END IF;

  SELECT m.winning_alliance, e.manual_results
    INTO v_match
    FROM matches m
    JOIN events e ON e.id = m.event_id
    WHERE m.id = p_match_id
    FOR UPDATE OF m;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  IF NOT v_match.manual_results THEN
    RAISE EXCEPTION 'This event''s results come from TBA';
  END IF;
  IF v_match.winning_alliance IS NOT NULL THEN
    RAISE EXCEPTION 'This match''s result has already been revealed';
  END IF;

  v_winner := CASE
    WHEN p_red_score > p_blue_score THEN 'red'
    WHEN p_blue_score > p_red_score THEN 'blue'
    ELSE 'tie'
  END;

  PERFORM set_config('app.revealing_result', 'on', true);
  UPDATE matches
    SET winning_alliance = v_winner, red_score = p_red_score, blue_score = p_blue_score
    WHERE id = p_match_id;
  PERFORM set_config('app.revealing_result', 'off', true);

  PERFORM settle_match_bets(p_match_id, v_winner, NULL);
  RETURN v_winner;
END;
$$;

REVOKE ALL ON FUNCTION reveal_match_result(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reveal_match_result(UUID, INTEGER, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- Signup day: new accounts join the event and start with its coins
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION signup_day_of(p_user_id UUID)
RETURNS DATE
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (created_at AT TIME ZONE 'America/Los_Angeles')::date FROM auth.users WHERE id = p_user_id;
$$;
REVOKE ALL ON FUNCTION signup_day_of(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION join_signup_day_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE events
    SET users = (COALESCE(users::jsonb, '[]'::jsonb) || to_jsonb(NEW.id::text))::json
    WHERE signup_date = signup_day_of(NEW.id)
      AND NOT (COALESCE(users::jsonb, '[]'::jsonb) ? NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_join_signup_day_events ON profiles;
CREATE TRIGGER profiles_join_signup_day_events
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION join_signup_day_events();

CREATE OR REPLACE FUNCTION grant_signup_day_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points INTEGER;
BEGIN
  SELECT MAX(signup_points) INTO v_points
    FROM events
    WHERE signup_points IS NOT NULL AND signup_date = signup_day_of(NEW.user_id);
  IF v_points IS NOT NULL THEN
    NEW.points := COALESCE(NEW.points, 0) + v_points;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS game_profiles_grant_signup_day_points ON game_profiles;
CREATE TRIGGER game_profiles_grant_signup_day_points
  BEFORE INSERT ON game_profiles
  FOR EACH ROW
  EXECUTE FUNCTION grant_signup_day_points();

-- ---------------------------------------------------------------------------
-- The event itself (once), its matches, and the accounts already made today
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_source events%ROWTYPE;
  v_event_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM events WHERE name = 'Invent The Rest') THEN
    RETURN;
  END IF;

  SELECT * INTO v_source FROM events WHERE event_code = '2026mttd' ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Madtown Throwdown (2026mttd) not found';
  END IF;

  -- setActiveEvent's order: deactivate everything, then activate the one
  UPDATE events SET is_active = false WHERE is_active;

  INSERT INTO events (
    name, event_code, is_active, location, scouting_map_url, users,
    scouters_per_robot, convert_bbots, bbot_teams,
    manual_results, signup_date, signup_points
  )
  VALUES (
    'Invent The Rest', v_source.event_code, true, v_source.location, v_source.scouting_map_url, v_source.users,
    v_source.scouters_per_robot, v_source.convert_bbots, v_source.bbot_teams,
    true, DATE '2026-11-15', 2500
  )
  RETURNING id INTO v_event_id;

  -- Same schedule and predictions; no results, start times, videos or scout assignments.
  -- Match names are unique across events.
  INSERT INTO matches (name, event_id, match_number, match13_red_win_prob, statbotics_red_win_prob)
  SELECT 'ITR-Q' || match_number, v_event_id, match_number, match13_red_win_prob, statbotics_red_win_prob
    FROM matches
    WHERE event_id = v_source.id
    ORDER BY match_number;

  -- Accounts already created today: join the event and get the starting coins
  UPDATE events
    SET users = (
      SELECT to_json(ARRAY(
        SELECT DISTINCT u FROM (
          SELECT json_array_elements_text(COALESCE(v_source.users, '[]'::json)) AS u
          UNION
          SELECT p.id::text FROM profiles p WHERE signup_day_of(p.id) = DATE '2026-11-15'
        ) ids
      ))
    )
    WHERE id = v_event_id;

  UPDATE game_profiles
    SET points = points + 2500
    WHERE signup_day_of(user_id) = DATE '2026-11-15';
END;
$$;
