-- The live picklist the picklist host runs, shared so anyone can watch it from their own
-- screen. The host's app writes the whole list here as it changes; everyone else only reads.
CREATE TABLE IF NOT EXISTS live_picklists (
  event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- [{ teamNumber, averageRank, moved }] in list order
  entries JSONB NOT NULL DEFAULT '[]',
  -- How many people's picklists the list is averaged from (0 = sorted by team number)
  compiled_count INTEGER NOT NULL DEFAULT 0,
  is_live BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE live_picklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone signed in can watch live picklists" ON live_picklists;
CREATE POLICY "Anyone signed in can watch live picklists" ON live_picklists FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Picklist hosts can start their live picklist" ON live_picklists;
CREATE POLICY "Picklist hosts can start their live picklist" ON live_picklists FOR INSERT
  WITH CHECK (
    host_id = auth.uid()
    AND EXISTS (SELECT 1 FROM events WHERE events.id = event_id AND events.picklist_host_id = auth.uid())
  );

DROP POLICY IF EXISTS "Picklist hosts can update their live picklist" ON live_picklists;
CREATE POLICY "Picklist hosts can update their live picklist" ON live_picklists FOR UPDATE
  USING (EXISTS (SELECT 1 FROM events WHERE events.id = event_id AND events.picklist_host_id = auth.uid()))
  WITH CHECK (
    host_id = auth.uid()
    AND EXISTS (SELECT 1 FROM events WHERE events.id = event_id AND events.picklist_host_id = auth.uid())
  );

-- Suggestions viewers send the host ("move 254 up 3 spots"; spots is optional).
CREATE TABLE IF NOT EXISTS live_picklist_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_number INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  spots INTEGER CHECK (spots IS NULL OR spots > 0),
  author_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_picklist_suggestions_event_id ON live_picklist_suggestions(event_id);

ALTER TABLE live_picklist_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone signed in can see live picklist suggestions" ON live_picklist_suggestions;
CREATE POLICY "Anyone signed in can see live picklist suggestions" ON live_picklist_suggestions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can suggest while the picklist is live" ON live_picklist_suggestions;
CREATE POLICY "Anyone can suggest while the picklist is live" ON live_picklist_suggestions FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM live_picklists
      WHERE live_picklists.event_id = live_picklist_suggestions.event_id AND live_picklists.is_live
    )
  );

DROP POLICY IF EXISTS "Picklist hosts can resolve suggestions" ON live_picklist_suggestions;
CREATE POLICY "Picklist hosts can resolve suggestions" ON live_picklist_suggestions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM events WHERE events.id = event_id AND events.picklist_host_id = auth.uid()));

-- Live updates (skipped if already published)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE live_picklists;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE live_picklist_suggestions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
