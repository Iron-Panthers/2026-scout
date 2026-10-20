-- Delete direct messages more than 3 months old, once a day.
--
-- Verify the cron job:
--   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'delete-old-messages';
--
-- Monitor recent runs:
--   SELECT * FROM cron.job_run_details WHERE jobname = 'delete-old-messages' ORDER BY start_time DESC LIMIT 20;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any existing job (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-old-messages') THEN
    PERFORM cron.unschedule('delete-old-messages');
  END IF;
END;
$$;

-- Daily at 09:00 UTC (early morning in the US, outside event hours)
SELECT cron.schedule(
  'delete-old-messages',
  '0 9 * * *',
  $$ DELETE FROM public.messages WHERE created_at < now() - interval '3 months' $$
);

-- Clear out anything already past the cutoff
DELETE FROM public.messages WHERE created_at < now() - interval '3 months';
