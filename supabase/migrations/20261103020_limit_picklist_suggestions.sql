-- The host takes at most 3 suggestions at a time: a new one can only be sent while fewer
-- than 3 are pending for the event.
DROP POLICY IF EXISTS "Anyone can suggest while the picklist is live" ON live_picklist_suggestions;
CREATE POLICY "Anyone can suggest while the picklist is live" ON live_picklist_suggestions FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM live_picklists
      WHERE live_picklists.event_id = live_picklist_suggestions.event_id AND live_picklists.is_live
    )
    AND (
      SELECT count(*) FROM live_picklist_suggestions AS pending
      WHERE pending.event_id = live_picklist_suggestions.event_id AND pending.status = 'pending'
    ) < 3
  );
