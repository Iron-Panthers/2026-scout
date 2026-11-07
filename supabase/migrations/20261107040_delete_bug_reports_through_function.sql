-- Deleting a bug report relied on the "Developers can delete bug reports" policy, and a
-- delete the policy blocks just removes nothing, so the app could only say it failed. Delete
-- through this function instead: it checks for a developer itself and says why it refused.
-- The report's comments go with it (ON DELETE CASCADE).
CREATE OR REPLACE FUNCTION delete_bug_report(p_report UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_developer() THEN
    RAISE EXCEPTION 'Only developers can delete bug reports';
  END IF;
  DELETE FROM bug_reports WHERE id = p_report;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bug report not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION delete_bug_report(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_bug_report(UUID) TO authenticated;
