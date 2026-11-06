-- Event coins (game_profiles.event_points) are one balance that every competition event's
-- currency shares (ChezCoins, Madcoins, ...), so each new event has to start everyone at 0.
-- This remembers which event the balances belong to and, when a newer event becomes active,
-- resets every balance and cancels pending event-coin bets on other events' matches (their
-- stakes were in the old currency, so they aren't refunded).
--
-- "Newer" goes by start date, so re-activating the same event, an older one, or one without
-- a start date (a test event) keeps everyone's balance.

CREATE TABLE IF NOT EXISTS event_currency_state (
  -- Only ever one row
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No policies: only the trigger function below (SECURITY DEFINER) touches it
ALTER TABLE event_currency_state ENABLE ROW LEVEL SECURITY;

-- Balances were reset by hand when 2026 Madtown Throwdown started, so they belong to the
-- event that's active now
INSERT INTO event_currency_state (event_id)
SELECT id FROM events WHERE is_active ORDER BY start_date DESC NULLS LAST LIMIT 1
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION reset_event_points_for_new_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current events%ROWTYPE;
BEGIN
  SELECT e.* INTO v_current
  FROM event_currency_state s
  JOIN events e ON e.id = s.event_id;

  IF FOUND THEN
    -- The same event again, an older one, or a test event: keep the balances
    IF NEW.id = v_current.id OR NEW.start_date IS NULL OR NEW.start_date <= v_current.start_date THEN
      RETURN NEW;
    END IF;
  -- No event on record (it was deleted): only a dated event starts a new currency
  ELSIF NEW.start_date IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE bets b
  SET status = 'cancelled', updated_at = now()
  WHERE b.currency = 'event'
    AND b.status = 'pending'
    AND NOT EXISTS (SELECT 1 FROM matches m WHERE m.id = b.match_id AND m.event_id = NEW.id);

  UPDATE game_profiles SET event_points = 0 WHERE event_points <> 0;

  INSERT INTO event_currency_state (id, event_id, reset_at)
  VALUES (TRUE, NEW.id, now())
  ON CONFLICT (id) DO UPDATE SET event_id = EXCLUDED.event_id, reset_at = EXCLUDED.reset_at;

  RETURN NEW;
END;
$$;

-- setActiveEvent deactivates every event, then activates one
DROP TRIGGER IF EXISTS events_reset_event_points ON events;
CREATE TRIGGER events_reset_event_points
  AFTER UPDATE OF is_active ON events
  FOR EACH ROW
  WHEN (NEW.is_active AND OLD.is_active IS NOT TRUE)
  EXECUTE FUNCTION reset_event_points_for_new_event();

DROP TRIGGER IF EXISTS events_reset_event_points_on_insert ON events;
CREATE TRIGGER events_reset_event_points_on_insert
  AFTER INSERT ON events
  FOR EACH ROW
  WHEN (NEW.is_active)
  EXECUTE FUNCTION reset_event_points_for_new_event();
