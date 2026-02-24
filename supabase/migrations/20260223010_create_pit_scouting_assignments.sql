CREATE TABLE pit_scouting_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_number INTEGER NOT NULL,
  scouter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, team_number)
);

-- RLS policies: managers can insert/update/delete, all authenticated users can select
ALTER TABLE pit_scouting_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read pit assignments" ON pit_scouting_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can manage pit assignments" ON pit_scouting_assignments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_manager = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_manager = true));
