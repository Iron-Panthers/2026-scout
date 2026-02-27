-- Migrate match assignment notifications to server-side push via pg_net.
--
-- Replaces the old system (DB trigger → match_assignment_notifications table →
-- client realtime subscription) with a direct DB trigger → edge function → Web Push flow.
-- This works whether the user has the app open or not.
--
-- SETUP REQUIRED: Before this trigger fires you must configure the project URL and
-- service role key as Postgres settings. Run the following once in the Supabase SQL Editor
-- (replace placeholders with your actual values):
--
--   ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://YOUR_PROJECT_REF.supabase.co';
--   ALTER DATABASE postgres SET "app.settings.service_role_key" = 'YOUR_SERVICE_ROLE_KEY';
--
-- These are stored in pg_settings and are NOT logged or visible to row-level queries.

-- ── 1. Remove old trigger and function ───────────────────────────────────────
DROP TRIGGER IF EXISTS on_match_assignment ON matches;
DROP FUNCTION IF EXISTS notify_match_assignment();

-- ── 2. Drop the old intermediary table ───────────────────────────────────────
-- First remove it from the realtime publication so the DROP doesn't error.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE match_assignment_notifications;
EXCEPTION WHEN undefined_table OR undefined_object OR others THEN
  NULL; -- Ignore if the table/publication entry doesn't exist
END;
$$;

DROP TABLE IF EXISTS match_assignment_notifications CASCADE;

-- ── 3. New trigger function using pg_net ─────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_match_assignment_push()
RETURNS TRIGGER AS $$
DECLARE
  scouter_columns TEXT[] := ARRAY[
    'red1_scouter_id', 'red2_scouter_id', 'red3_scouter_id', 'qual_red_scouter_id',
    'blue1_scouter_id', 'blue2_scouter_id', 'blue3_scouter_id', 'qual_blue_scouter_id'
  ];
  col            TEXT;
  old_value      UUID;
  new_value      UUID;
  payload        JSONB;
  supabase_url   TEXT;
  svc_role_key   TEXT;
  edge_fn_url    TEXT;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  svc_role_key := current_setting('app.settings.service_role_key', true);

  -- Skip silently if pg_net URL/key have not been configured yet
  IF supabase_url IS NULL OR svc_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  edge_fn_url := supabase_url || '/functions/v1/send-match-assignment-notification';

  FOREACH col IN ARRAY scouter_columns LOOP
    EXECUTE format('SELECT ($1).%I', col) INTO old_value USING OLD;
    EXECUTE format('SELECT ($1).%I', col) INTO new_value USING NEW;

    -- Scout was assigned (new assignment or replacement)
    IF new_value IS NOT NULL AND (old_value IS NULL OR old_value <> new_value) THEN
      payload := jsonb_build_object(
        'type',        'assigned',
        'userId',      new_value,
        'matchId',     NEW.id,
        'matchNumber', NEW.match_number,
        'eventId',     NEW.event_id,
        'role',        col
      );
      PERFORM net.http_post(
        url     := edge_fn_url,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || svc_role_key
        ),
        body := payload
      );
    END IF;

    -- Scout was removed (cleared or replaced by someone else)
    IF old_value IS NOT NULL AND (new_value IS NULL OR old_value <> new_value) THEN
      payload := jsonb_build_object(
        'type',        'removed',
        'userId',      old_value,
        'matchId',     NEW.id,
        'matchNumber', NEW.match_number,
        'eventId',     NEW.event_id,
        'role',        col
      );
      PERFORM net.http_post(
        url     := edge_fn_url,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || svc_role_key
        ),
        body := payload
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Attach trigger to matches table ───────────────────────────────────────
DROP TRIGGER IF EXISTS on_match_assignment ON matches;
CREATE TRIGGER on_match_assignment
  AFTER INSERT OR UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION notify_match_assignment_push();
