-- Schedule pg_cron job to call sync-match-results every 2 minutes.
--
-- Previously this only ran reactively when someone opened the Betting page
-- or a match's detail page — if nobody happened to be looking (e.g.
-- everyone's busy scouting), a finished match's winning_alliance (and the
-- bets that settle off of it) could sit stale for a long time after the
-- match actually ended. Running it on a schedule keeps results and
-- settlement current regardless of who's looking at what.
--
-- The edge function is deployed with verify_jwt=false, so the anon key
-- (already public in the frontend) is sufficient to trigger it.
-- The function itself gets SUPABASE_SERVICE_ROLE_KEY, TBA_AUTH_KEY, and
-- M13_API_KEY from its own runtime env.
--
-- Verify the cron job:
--   SELECT jobid, jobname, schedule, active FROM cron.job;
--
-- Monitor recent runs:
--   SELECT * FROM cron.job_run_details WHERE jobname = 'sync-match-results' ORDER BY start_time DESC LIMIT 20;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing job (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-match-results') THEN
    PERFORM cron.unschedule('sync-match-results');
  END IF;
END;
$$;

SELECT cron.schedule(
  'sync-match-results',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qwzsrlbhwigozonzthvx.supabase.co/functions/v1/sync-match-results',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_oXZHMiIO-CsAg1eBWHvtww_JHjcocfU"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
