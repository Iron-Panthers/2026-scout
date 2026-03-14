-- Schedule pg_cron job to call fetch-tba-climb-data every 20 minutes.
--
-- Fetches climb data (endGameTowerRobotN) from TBA for scouting submissions
-- that don't have tba_data yet. Groups by match key to minimize API calls.
--
-- The edge function is deployed with verify_jwt=false, so the anon key
-- (already public in the frontend) is sufficient to trigger it.
-- The function itself gets SUPABASE_SERVICE_ROLE_KEY from its own runtime env.
--
-- Verify the cron job:
--   SELECT jobid, jobname, schedule, active FROM cron.job;
--
-- Monitor recent runs:
--   SELECT * FROM cron.job_run_details WHERE jobname = 'fetch-tba-climb-data' ORDER BY start_time DESC LIMIT 20;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing job (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-tba-climb-data') THEN
    PERFORM cron.unschedule('fetch-tba-climb-data');
  END IF;
END;
$$;

SELECT cron.schedule(
  'fetch-tba-climb-data',
  '*/20 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qwzsrlbhwigozonzthvx.supabase.co/functions/v1/fetch-tba-climb-data',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_oXZHMiIO-CsAg1eBWHvtww_JHjcocfU"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
