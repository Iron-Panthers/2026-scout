-- Schedule pg_cron job to call send-match-notifications every 2 minutes.
--
-- The job reads the Supabase URL and service role key from database-level
-- settings at runtime, so no secrets are embedded in this migration.
--
-- PREREQUISITE: Configure these settings once in the Supabase SQL Editor
-- (same settings already required by the assignment-notification trigger):
--
--   ALTER DATABASE postgres
--     SET "app.settings.supabase_url" = 'https://YOUR_PROJECT_REF.supabase.co';
--   ALTER DATABASE postgres
--     SET "app.settings.service_role_key" = 'YOUR_SERVICE_ROLE_KEY';
--
-- Verify the cron job was created:
--   SELECT jobname, schedule, command FROM cron.job;
--
-- Monitor recent runs:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Ensure required extensions are present
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing job with this name (makes migration idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-match-notifications') THEN
    PERFORM cron.unschedule('send-match-notifications');
  END IF;
END;
$$;

-- Schedule the cron job.
-- current_setting() reads the database-level settings at execution time.
-- The WHERE clause skips the HTTP call if the settings haven't been configured yet,
-- so the job fails silently rather than throwing an error.
SELECT cron.schedule(
  'send-match-notifications',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url', true)
               || '/functions/v1/send-match-notifications',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body    := '{}'::jsonb
  )
  WHERE current_setting('app.settings.supabase_url', true)     IS NOT NULL
    AND current_setting('app.settings.service_role_key', true) IS NOT NULL
  $cron$
);
