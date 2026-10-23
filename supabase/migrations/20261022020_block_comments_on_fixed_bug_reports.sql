-- A bug report marked fixed is closed to new comments until a developer reopens it.

DROP POLICY IF EXISTS "Users can comment on bug reports" ON bug_report_comments;
CREATE POLICY "Users can comment on bug reports"
  ON bug_report_comments FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (SELECT 1 FROM bug_reports WHERE id = report_id AND status = 'open')
  );
