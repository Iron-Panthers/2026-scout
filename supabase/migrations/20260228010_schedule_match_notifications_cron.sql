-- Schedule pg_cron job to call send-match-notifications every 2 minutes.
--
-- NOTE: ALTER DATABASE SET is not permitted in Supabase's managed Postgres,
-- so this migration uses hardcoded values instead of current_setting().
-- The edge function is deployed with verify_jwt=false, so the anon key
-- (already public in the frontend) is sufficient to trigger it.
-- The function itself gets SUPABASE_SERVICE_ROLE_KEY from its own runtime env.
--
-- Verify the cron job:
--   SELECT jobid, jobname, schedule, active FROM cron.job;
--
-- Monitor recent runs:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing job (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-match-notifications') THEN
    PERFORM cron.unschedule('send-match-notifications');
  END IF;
END;
$$;

SELECT cron.schedule(
  'send-match-notifications',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qwzsrlbhwigozonzthvx.supabase.co/functions/v1/send-match-notifications',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_oXZHMiIO-CsAg1eBWHvtww_JHjcocfU"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
