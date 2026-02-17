-- Pit scouting submissions table
CREATE TABLE IF NOT EXISTS pit_scouting_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_num INTEGER NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  scouter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  scouter_name TEXT NOT NULL,
  pit_data JSONB NOT NULL DEFAULT '{}',
  photo_urls TEXT[],
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_pit_submission UNIQUE (event_id, team_num, scouter_id)
);

-- Create indexes for common queries
CREATE INDEX idx_pit_scouting_event_id ON pit_scouting_submissions(event_id);
CREATE INDEX idx_pit_scouting_team_num ON pit_scouting_submissions(team_num);
CREATE INDEX idx_pit_scouting_scouter_id ON pit_scouting_submissions(scouter_id);

-- Enable RLS
ALTER TABLE pit_scouting_submissions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view pit scouting submissions
CREATE POLICY "Users can view pit scouting submissions"
  ON pit_scouting_submissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- All authenticated users can insert pit scouting submissions
CREATE POLICY "Users can insert pit scouting submissions"
  ON pit_scouting_submissions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their own submissions
CREATE POLICY "Users can update own pit scouting submissions"
  ON pit_scouting_submissions FOR UPDATE
  USING (auth.uid() = scouter_id);

-- Managers can update any pit scouting submission
CREATE POLICY "Managers can update any pit scouting submission"
  ON pit_scouting_submissions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_manager = true
    )
  );

-- Only managers can delete pit scouting submissions
CREATE POLICY "Managers can delete pit scouting submissions"
  ON pit_scouting_submissions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_manager = true
    )
  );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_pit_scouting_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pit_scouting_submissions_updated_at
  BEFORE UPDATE ON pit_scouting_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_pit_scouting_updated_at();
