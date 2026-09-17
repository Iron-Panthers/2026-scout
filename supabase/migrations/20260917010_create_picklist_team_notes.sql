-- Create picklist_team_notes table: per-user, per-event, per-team freeform
-- notes a scout/manager can jot down about a team while picklisting. Kept
-- separate from `picklists` since that table is rewritten wholesale on every
-- drag-and-drop reorder, while a note is a small, independent, low-frequency
-- edit that shouldn't need to round-trip the picked/do-not-pick arrays.
CREATE TABLE IF NOT EXISTS picklist_team_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_number INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, event_id, team_number)
);

ALTER TABLE picklist_team_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own picklist team notes" ON picklist_team_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own picklist team notes" ON picklist_team_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own picklist team notes" ON picklist_team_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_picklist_team_notes_user_id ON picklist_team_notes(user_id);
CREATE INDEX idx_picklist_team_notes_event_id ON picklist_team_notes(event_id);

CREATE OR REPLACE FUNCTION update_picklist_team_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER picklist_team_notes_updated_at
  BEFORE UPDATE ON picklist_team_notes
  FOR EACH ROW EXECUTE FUNCTION update_picklist_team_notes_updated_at();
