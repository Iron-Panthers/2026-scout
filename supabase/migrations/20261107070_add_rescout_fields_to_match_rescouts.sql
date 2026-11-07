-- A match rescout can redo only some fields (auto fuel, defense, ...): the manager picks them,
-- the original submission is kept, and the rescout's submission takes only those fields from
-- the new scouting, the rest from the original. NULL rescout_fields is a full rescout (the
-- original was deleted when it was assigned, as before).
-- Field ids are MATCH_RESCOUT_FIELDS in src/config/matchRescoutFields.ts.
ALTER TABLE match_rescouts
  ADD COLUMN IF NOT EXISTS rescout_fields TEXT[],
  -- Whose submission the rescout corrects, so it can be swapped for the merged one
  ADD COLUMN IF NOT EXISTS original_scouter_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Saves a partial rescout: the merged submission under the rescouter, in place of the
-- original scouter's (only the original's own scouter or a manager could delete that, so this
-- does both in one transaction). The caller must hold a partial rescout for the match role.
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
