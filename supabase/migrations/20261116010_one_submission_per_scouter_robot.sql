-- One submission per scouter for each robot (role) in a match. Nothing stopped a scouter from
-- submitting the same match and robot again — re-uploading from the offline list, or resubmitting
-- to fix something — so some had two or three copies, each counted in the data. Now a second
-- submission replaces the first.
--
-- Guest submissions (no scouter) can't be told apart, so they aren't limited.

-- 1. Remove the copies left (as 20261110010 did for Madtown): keep the latest — usually the
--    corrected one — and back the rest up to scouting_submissions_deleted_duplicates.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY match_id, role, scouter_id ORDER BY created_at DESC, id DESC) AS copy
  FROM scouting_submissions
  WHERE scouter_id IS NOT NULL AND match_id IS NOT NULL
),
backed_up AS (
  INSERT INTO scouting_submissions_deleted_duplicates
  SELECT s.* FROM scouting_submissions s WHERE s.id IN (SELECT id FROM ranked WHERE copy > 1)
  ON CONFLICT DO NOTHING
  RETURNING id
)
DELETE FROM scouting_submissions WHERE id IN (SELECT id FROM backed_up);

CREATE TABLE IF NOT EXISTS qual_scouting_submissions_deleted_duplicates (LIKE qual_scouting_submissions INCLUDING ALL);
-- With no policies the app can't read it; it's only reachable from the Supabase dashboard
ALTER TABLE qual_scouting_submissions_deleted_duplicates ENABLE ROW LEVEL SECURITY;

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY match_id, role, scouter_id ORDER BY created_at DESC, id DESC) AS copy
  FROM qual_scouting_submissions
  WHERE scouter_id IS NOT NULL AND match_id IS NOT NULL
),
backed_up AS (
  INSERT INTO qual_scouting_submissions_deleted_duplicates
  SELECT s.* FROM qual_scouting_submissions s WHERE s.id IN (SELECT id FROM ranked WHERE copy > 1)
  ON CONFLICT DO NOTHING
  RETURNING id
)
DELETE FROM qual_scouting_submissions WHERE id IN (SELECT id FROM backed_up);

-- 2. Enforce it (NULL scouters stay distinct, so guest submissions aren't limited)
CREATE UNIQUE INDEX IF NOT EXISTS scouting_submissions_one_per_scouter_role
  ON scouting_submissions (match_id, role, scouter_id);
CREATE UNIQUE INDEX IF NOT EXISTS qual_scouting_submissions_one_per_scouter_role
  ON qual_scouting_submissions (match_id, role, scouter_id);

-- 3. Submitting again replaces your earlier submission. Scouts can't update quant submissions
--    directly (only managers can), so this does it for the signed-in scouter's own row only.
CREATE OR REPLACE FUNCTION submit_scouting_data(
  p_match_id UUID,
  p_role TEXT,
  p_scouting_data JSONB,
  p_team_num INTEGER,
  p_match_type TEXT,
  p_schema_version INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO scouting_submissions (match_id, role, scouting_data, schema_version, scouter_id, team_num, match_type)
    VALUES (p_match_id, p_role, p_scouting_data, p_schema_version, auth.uid(), p_team_num, p_match_type)
  ON CONFLICT (match_id, role, scouter_id) DO UPDATE
    SET scouting_data = EXCLUDED.scouting_data,
        schema_version = EXCLUDED.schema_version,
        team_num = EXCLUDED.team_num,
        match_type = EXCLUDED.match_type
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION submit_scouting_data(UUID, TEXT, JSONB, INTEGER, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_scouting_data(UUID, TEXT, JSONB, INTEGER, TEXT, INTEGER) TO authenticated;

-- 4. A partial rescout by someone who already submitted this robot replaces theirs too
--    (same as 20261107070's version otherwise)
CREATE OR REPLACE FUNCTION submit_match_rescout(
  p_match_id UUID,
  p_role TEXT,
  p_scouting_data JSONB,
  p_team_num INTEGER,
  p_match_type TEXT,
  p_schema_version INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rescout RECORD;
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT original_scouter_id INTO v_rescout
    FROM match_rescouts
    WHERE match_id = p_match_id AND role = p_role AND scouter_id = auth.uid() AND rescout_fields IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You have no partial rescout for this match';
  END IF;

  INSERT INTO scouting_submissions (match_id, role, scouting_data, schema_version, scouter_id, team_num, match_type)
    VALUES (p_match_id, p_role, p_scouting_data, p_schema_version, auth.uid(), p_team_num, p_match_type)
  ON CONFLICT (match_id, role, scouter_id) DO UPDATE
    SET scouting_data = EXCLUDED.scouting_data,
        schema_version = EXCLUDED.schema_version,
        team_num = EXCLUDED.team_num,
        match_type = EXCLUDED.match_type
  RETURNING id INTO v_id;

  IF v_rescout.original_scouter_id IS NOT NULL AND v_rescout.original_scouter_id <> auth.uid() THEN
    DELETE FROM scouting_submissions
      WHERE match_id = p_match_id AND role = p_role AND scouter_id = v_rescout.original_scouter_id;
  END IF;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION submit_match_rescout(UUID, TEXT, JSONB, INTEGER, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION submit_match_rescout(UUID, TEXT, JSONB, INTEGER, TEXT, INTEGER) TO authenticated;
