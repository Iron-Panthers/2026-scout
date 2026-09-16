-- Create picklists table: per-user, per-event saved picklist state for the
-- Dashboard picklist tab ("Your Picklist" / "Do Not Pick" columns). The
-- "bank"/Available Teams column is intentionally not persisted here — it is
-- always re-derived from the live TBA roster minus these two lists.
CREATE TABLE IF NOT EXISTS picklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  picked_team_numbers INTEGER[] NOT NULL DEFAULT '{}',
  do_not_pick_team_numbers INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, event_id)
);

ALTER TABLE picklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own picklists" ON picklists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own picklists" ON picklists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own picklists" ON picklists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_picklists_user_id ON picklists(user_id);
CREATE INDEX idx_picklists_event_id ON picklists(event_id);

CREATE OR REPLACE FUNCTION update_picklists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER picklists_updated_at
  BEFORE UPDATE ON picklists
  FOR EACH ROW EXECUTE FUNCTION update_picklists_updated_at();
