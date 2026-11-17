-- Let a user delete their own account (Settings → Delete Account, which did nothing).
--
-- Deleting the auth user cascades to everything personal: profile, coins, bets, messages,
-- achievements, personal picklists and notes, push subscriptions. Scouting submissions were
-- already kept (scouter_id SET NULL). Shared things that would have cascaded are kept too:
--   * rosters they created (created_by is just a record of who made it)
--   * bug reports they filed, with everyone's comments, and their comments on others' reports
--     (shown as "Unknown")
-- and an account hosting a live picklist can't be deleted until it's handed over, since that
-- would delete the event's live picklist and everyone's suggestions on it.

ALTER TABLE rosters ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE rosters DROP CONSTRAINT IF EXISTS rosters_created_by_fkey;
ALTER TABLE rosters ADD CONSTRAINT rosters_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE bug_reports ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_author_id_fkey;
ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE bug_report_comments ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE bug_report_comments DROP CONSTRAINT IF EXISTS bug_report_comments_author_id_fkey;
ALTER TABLE bug_report_comments ADD CONSTRAINT bug_report_comments_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM live_picklists WHERE host_id = v_user) THEN
    RAISE EXCEPTION 'You''re hosting a live picklist — have a manager hand it to someone else first';
  END IF;

  DELETE FROM auth.users WHERE id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
