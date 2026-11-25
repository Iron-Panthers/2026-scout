-- The days each user opened the app during a seasonal event (src/config/seasonalEvents.ts),
-- for rewards that need every day of it (Thanksgiving 2026's Team Appreciate theme).
-- Days are the user's own calendar date, as the events are.

CREATE TABLE IF NOT EXISTS seasonal_event_logins (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 100),
  day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id, day)
);

ALTER TABLE seasonal_event_logins ENABLE ROW LEVEL SECURITY;
-- Written only by record_seasonal_login()
DROP POLICY IF EXISTS "Users can view their own seasonal logins" ON seasonal_event_logins;
CREATE POLICY "Users can view their own seasonal logins"
  ON seasonal_event_logins FOR SELECT USING (auth.uid() = user_id);

-- Records that the signed-in user opened the app today (their local date) during an event, and
-- returns how many different days they have for it. Only today can be recorded: the date has to
-- be within a day of the server's, which covers every time zone, so missed days can't be filled in.
CREATE OR REPLACE FUNCTION record_seasonal_login(p_event_id TEXT, p_day DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_day < (now() AT TIME ZONE 'utc')::date - 1 OR p_day > (now() AT TIME ZONE 'utc')::date + 1 THEN
    RAISE EXCEPTION 'Only today can be recorded';
  END IF;

  INSERT INTO seasonal_event_logins (user_id, event_id, day) VALUES (auth.uid(), p_event_id, p_day)
    ON CONFLICT DO NOTHING;

  SELECT count(*) INTO v_days FROM seasonal_event_logins WHERE user_id = auth.uid() AND event_id = p_event_id;
  RETURN v_days;
END;
$$;

REVOKE ALL ON FUNCTION record_seasonal_login(TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_seasonal_login(TEXT, DATE) TO authenticated;
