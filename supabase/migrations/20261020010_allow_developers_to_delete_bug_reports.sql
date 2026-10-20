-- Developers can delete a bug report thread; its comments go with it (ON DELETE CASCADE).
DROP POLICY IF EXISTS "Developers can delete bug reports" ON bug_reports;
CREATE POLICY "Developers can delete bug reports"
  ON bug_reports FOR DELETE USING (is_developer());
