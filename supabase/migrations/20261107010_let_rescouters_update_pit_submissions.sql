-- A pit rescout edits the original scouter's submission, but only that scouter or a manager could
-- update it, so a rescout by anyone else updated nothing ("Cannot coerce the result to a single
-- JSON object"). Let whoever is assigned the team at that event update its submission. With no
-- WITH CHECK, the row must still match their assignment afterwards, so it can't be moved to
-- another team or event.
DROP POLICY IF EXISTS "Assigned scouters can update pit scouting submissions" ON pit_scouting_submissions;
CREATE POLICY "Assigned scouters can update pit scouting submissions"
  ON pit_scouting_submissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM pit_scouting_assignments a
      WHERE a.event_id = pit_scouting_submissions.event_id
      AND a.team_number = pit_scouting_submissions.team_num
      AND a.scouter_id = auth.uid()
    )
  );

-- After a rescout the scouter clears their assignment so it leaves their dashboard; only
-- managers could delete assignments, so that silently did nothing.
DROP POLICY IF EXISTS "Scouters can clear their own pit assignments" ON pit_scouting_assignments;
CREATE POLICY "Scouters can clear their own pit assignments" ON pit_scouting_assignments
  FOR DELETE TO authenticated
  USING (scouter_id = auth.uid());
