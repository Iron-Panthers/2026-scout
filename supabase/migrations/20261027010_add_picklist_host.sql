-- Each event can have a picklist host, chosen by a manager on the Event Information tab.
-- The host runs the live picklist, which averages the picklists of the people they pick,
-- so they can read everyone's picklist for that event and get live updates as they change.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS picklist_host_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "Picklist hosts can view their event's picklists" ON picklists;
CREATE POLICY "Picklist hosts can view their event's picklists" ON picklists FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = picklists.event_id
        AND events.picklist_host_id = auth.uid()
    )
  );

-- Live updates (skipped if already published)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE picklists;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
