-- The picklist host can read everyone's picklist notes for their event, shown on each
-- team in the live picklist. Everyone else still only sees their own.
DROP POLICY IF EXISTS "Picklist hosts can view their event's team notes" ON picklist_team_notes;
CREATE POLICY "Picklist hosts can view their event's team notes" ON picklist_team_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = picklist_team_notes.event_id
        AND events.picklist_host_id = auth.uid()
    )
  );
