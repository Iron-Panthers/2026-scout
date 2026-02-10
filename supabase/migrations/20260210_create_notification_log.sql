-- Notification deduplication log
-- Prevents sending the same notification multiple times when the cron runs repeatedly
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_tag TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, notification_tag)
);

-- Enable RLS (only service_role accesses this table via Edge Function)
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Index for cleanup queries
CREATE INDEX idx_notification_log_sent_at ON notification_log(sent_at);
