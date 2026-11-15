-- When each user last looked at each bug report, for the "new activity" markers. These were
-- kept in the browser's localStorage, which is per web address and per device: a new deploy
-- address (or another device) started everyone over with every report marked new. Stamped
-- with the server's clock, the same one bug_reports.updated_at uses.

CREATE TABLE IF NOT EXISTS bug_report_views (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, report_id)
);

ALTER TABLE bug_report_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own bug report views" ON bug_report_views;
CREATE POLICY "Users can view their own bug report views"
  ON bug_report_views FOR SELECT USING (auth.uid() = user_id);

-- Written only through mark_bug_report_seen, so seen_at is always the server's time
CREATE OR REPLACE FUNCTION mark_bug_report_seen(p_report UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seen TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Never earlier than the report's own last activity (now() is the transaction's start)
  SELECT GREATEST(now(), updated_at) INTO v_seen FROM bug_reports WHERE id = p_report;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO bug_report_views (user_id, report_id, seen_at)
  VALUES (auth.uid(), p_report, v_seen)
  ON CONFLICT (user_id, report_id) DO UPDATE
    SET seen_at = GREATEST(bug_report_views.seen_at, EXCLUDED.seen_at);

  RETURN v_seen;
END;
$$;

REVOKE ALL ON FUNCTION mark_bug_report_seen(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_bug_report_seen(UUID) TO authenticated;
