-- Add a second scouter slot per role, for co-scouting: two people attached
-- to the same role together (no alternating/rotation logic — both are just
-- shown and notified as assignees of that role). Applies to both the live
-- per-match assignment table and roster templates, matching the existing
-- `<role>_scouter_id` column naming with a `_2` suffix.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS red1_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS red2_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS red3_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qual_red_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blue1_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blue2_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blue3_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qual_blue_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE rosters
  ADD COLUMN IF NOT EXISTS red1_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS red2_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS red3_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qual_red_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blue1_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blue2_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blue3_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qual_blue_scouter_id_2 UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Extend the push-notification trigger to also watch the new slot-2 columns,
-- so a co-scout gets assigned/removed notifications the same as the primary.
CREATE OR REPLACE FUNCTION notify_match_assignment_push()
RETURNS TRIGGER AS $$
DECLARE
  scouter_columns TEXT[] := ARRAY[
    'red1_scouter_id', 'red2_scouter_id', 'red3_scouter_id', 'qual_red_scouter_id',
    'blue1_scouter_id', 'blue2_scouter_id', 'blue3_scouter_id', 'qual_blue_scouter_id',
    'red1_scouter_id_2', 'red2_scouter_id_2', 'red3_scouter_id_2', 'qual_red_scouter_id_2',
    'blue1_scouter_id_2', 'blue2_scouter_id_2', 'blue3_scouter_id_2', 'qual_blue_scouter_id_2'
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
