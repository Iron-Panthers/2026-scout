CREATE TABLE IF NOT EXISTS qual_scouting_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('qualRed', 'qualBlue')),
  scouting_data JSONB NOT NULL DEFAULT '{}',
  schema_version INTEGER NOT NULL DEFAULT 1,
  scouter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  time TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_qual_scouting_match_id ON qual_scouting_submissions(match_id);
CREATE INDEX idx_qual_scouting_scouter_id ON qual_scouting_submissions(scouter_id);

ALTER TABLE qual_scouting_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view qual scouting submissions"
  ON qual_scouting_submissions FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert qual scouting submissions"
  ON qual_scouting_submissions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own qual scouting submissions"
  ON qual_scouting_submissions FOR UPDATE USING (auth.uid() = scouter_id);

CREATE POLICY "Managers can update any qual scouting submission"
  ON qual_scouting_submissions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true)
  );

CREATE POLICY "Managers can delete qual scouting submissions"
  ON qual_scouting_submissions FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true)
  );

CREATE OR REPLACE FUNCTION update_qual_scouting_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER update_qual_scouting_submissions_updated_at
  BEFORE UPDATE ON qual_scouting_submissions
  FOR EACH ROW EXECUTE FUNCTION update_qual_scouting_updated_at();
