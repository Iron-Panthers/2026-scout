-- A manager checked a submission the scouter flagged with a scouting error and found
-- the data correct: it stays as-is (no rescout), and the manager dashboard shows the
-- cell in its own shade of green instead of red.
CREATE TABLE IF NOT EXISTS scouting_error_validations (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  scouter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  validated_by UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, role, scouter_id)
);

ALTER TABLE scouting_error_validations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view scouting error validations" ON scouting_error_validations;
CREATE POLICY "Authenticated users can view scouting error validations"
  ON scouting_error_validations FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers can manage scouting error validations" ON scouting_error_validations;
CREATE POLICY "Managers can manage scouting error validations"
  ON scouting_error_validations FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true));
