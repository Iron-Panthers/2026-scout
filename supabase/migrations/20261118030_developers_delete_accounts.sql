-- Developers can delete someone else's account from that person's profile (after typing DELETE,
-- as for deleting your own). It removes the same things delete_my_account does (20261116020):
-- the sign-in and everything personal, keeping scouting submissions, rosters and bug reports.
--
-- Not for your own account (Settings does that) or another developer's, and not while they host
-- a live picklist, since that would delete the event's picklist and everyone's suggestions.
CREATE OR REPLACE FUNCTION delete_user_account(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT is_developer() THEN
    RAISE EXCEPTION 'Only developers can delete other accounts';
  END IF;

  IF p_user = auth.uid() THEN
    RAISE EXCEPTION 'Delete your own account from Settings';
  END IF;

  IF COALESCE((SELECT is_developer FROM profiles WHERE id = p_user), false) THEN
    RAISE EXCEPTION 'Developer accounts can''t be deleted by another developer';
  END IF;

  IF EXISTS (SELECT 1 FROM live_picklists WHERE host_id = p_user) THEN
    RAISE EXCEPTION 'They''re hosting a live picklist — have a manager hand it to someone else first';
  END IF;

  DELETE FROM auth.users WHERE id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That account no longer exists';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION delete_user_account(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_user_account(UUID) TO authenticated;
