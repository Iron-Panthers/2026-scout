-- Bug Reporting: a shared issue inbox on the messages page. Anyone can file a report
-- (a titled topic) and comment under any report; everyone can see every report and
-- comment; only developers (profiles.is_developer) can mark a report fixed or reopen it.

CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 4000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed')),
  fixed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fixed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Last activity (new comment or status change), for sorting the inbox
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bug_report_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_updated ON bug_reports(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_report_comments_report ON bug_report_comments(report_id, created_at);

-- Whether the caller is a developer. SECURITY DEFINER so it doesn't depend on
-- profiles' own policies.
CREATE OR REPLACE FUNCTION is_developer()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_developer FROM profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION is_developer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_developer() TO authenticated;

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_report_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view bug reports" ON bug_reports;
CREATE POLICY "Authenticated users can view bug reports"
  ON bug_reports FOR SELECT USING (auth.uid() IS NOT NULL);

-- File a report as yourself; it starts open
DROP POLICY IF EXISTS "Users can file bug reports" ON bug_reports;
CREATE POLICY "Users can file bug reports"
  ON bug_reports FOR INSERT WITH CHECK (
    auth.uid() = author_id AND status = 'open' AND fixed_by IS NULL AND fixed_at IS NULL
  );
-- No update/delete policies: status changes go through set_bug_report_status()

DROP POLICY IF EXISTS "Authenticated users can view bug report comments" ON bug_report_comments;
CREATE POLICY "Authenticated users can view bug report comments"
  ON bug_report_comments FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can comment on bug reports" ON bug_report_comments;
CREATE POLICY "Users can comment on bug reports"
  ON bug_report_comments FOR INSERT WITH CHECK (auth.uid() = author_id);

-- A new comment counts as activity on its report
CREATE OR REPLACE FUNCTION touch_bug_report_on_comment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bug_reports SET updated_at = NEW.created_at WHERE id = NEW.report_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS bug_report_comment_touch ON bug_report_comments;
CREATE TRIGGER bug_report_comment_touch
  AFTER INSERT ON bug_report_comments
  FOR EACH ROW EXECUTE FUNCTION touch_bug_report_on_comment();

-- Developers only: mark a report fixed, or reopen it
CREATE OR REPLACE FUNCTION set_bug_report_status(p_report UUID, p_fixed BOOLEAN)
RETURNS VOID AS $$
BEGIN
  IF NOT is_developer() THEN
    RAISE EXCEPTION 'Only developers can change a bug report''s status';
  END IF;
  UPDATE bug_reports
  SET status     = CASE WHEN p_fixed THEN 'fixed' ELSE 'open' END,
      fixed_by   = CASE WHEN p_fixed THEN auth.uid() ELSE NULL END,
      fixed_at   = CASE WHEN p_fixed THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_report;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION set_bug_report_status(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_bug_report_status(UUID, BOOLEAN) TO authenticated;

-- Live updates (skipped if already published)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE bug_reports;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE bug_report_comments;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- ── Push notifications ───────────────────────────────────────────────────────
-- Same setup as message pushes: pg_net calls send-message-notification with a "kind":
--   bug_report  (new report)        → developers
--   bug_comment (new comment)       → the report's author, other commenters and developers
--   bug_fixed   (marked fixed)      → the report's author
-- Skipped silently until app.settings.supabase_url / service_role_key are configured.
CREATE OR REPLACE FUNCTION notify_bug_report_push()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT := current_setting('app.settings.supabase_url', true);
  svc_role_key TEXT := current_setting('app.settings.service_role_key', true);
  payload      JSONB;
BEGIN
  IF supabase_url IS NULL OR svc_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'bug_report_comments' THEN
    payload := jsonb_build_object('kind', 'bug_comment', 'reportId', NEW.report_id, 'actorId', NEW.author_id, 'body', left(NEW.body, 200));
  ELSIF TG_OP = 'INSERT' THEN
    payload := jsonb_build_object('kind', 'bug_report', 'reportId', NEW.id, 'actorId', NEW.author_id, 'body', NEW.title);
  ELSIF NEW.status = 'fixed' AND OLD.status IS DISTINCT FROM 'fixed' THEN
    payload := jsonb_build_object('kind', 'bug_fixed', 'reportId', NEW.id, 'actorId', NEW.fixed_by, 'body', NEW.title);
  ELSE
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/send-message-notification',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_role_key),
    body    := payload
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_bug_report_filed ON bug_reports;
CREATE TRIGGER on_bug_report_filed
  AFTER INSERT ON bug_reports
  FOR EACH ROW EXECUTE FUNCTION notify_bug_report_push();

DROP TRIGGER IF EXISTS on_bug_report_status ON bug_reports;
CREATE TRIGGER on_bug_report_status
  AFTER UPDATE OF status ON bug_reports
  FOR EACH ROW EXECUTE FUNCTION notify_bug_report_push();

DROP TRIGGER IF EXISTS on_bug_report_comment ON bug_report_comments;
CREATE TRIGGER on_bug_report_comment
  AFTER INSERT ON bug_report_comments
  FOR EACH ROW EXECUTE FUNCTION notify_bug_report_push();
