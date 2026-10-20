-- Marks a match assignment as a rescout: a manager flagged the previous
-- submission's scouting error, deleted it, and assigned a new scouter. The
-- scouter's dashboard uses this to show the match as a rescout card and to
-- display the error that prompted it.
CREATE TABLE IF NOT EXISTS match_rescouts (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  scouter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, role, scouter_id)
);

CREATE INDEX IF NOT EXISTS idx_match_rescouts_scouter ON match_rescouts(scouter_id);

ALTER TABLE match_rescouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view match rescouts" ON match_rescouts;
CREATE POLICY "Authenticated users can view match rescouts"
  ON match_rescouts FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Managers can manage match rescouts" ON match_rescouts;
CREATE POLICY "Managers can manage match rescouts"
  ON match_rescouts FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true));
