-- Create rosters table for saving scout assignment templates
CREATE TABLE IF NOT EXISTS rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Scout assignments (mirrors matches table structure)
  red1_scouter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  red2_scouter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  red3_scouter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  qual_red_scouter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  blue1_scouter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  blue2_scouter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  blue3_scouter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  qual_blue_scouter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(event_id, name)
);

-- Enable Row Level Security
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;

-- Managers can view rosters for events
CREATE POLICY "Managers can view rosters" ON rosters FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true
  ));

-- Managers can create rosters
CREATE POLICY "Managers can create rosters" ON rosters FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true)
  );

-- Managers can update their own rosters
CREATE POLICY "Managers can update own rosters" ON rosters FOR UPDATE
  USING (
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true)
  );

-- Managers can delete their own rosters
CREATE POLICY "Managers can delete own rosters" ON rosters FOR DELETE
  USING (
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true)
  );

-- Indexes for faster queries
CREATE INDEX idx_rosters_event_id ON rosters(event_id);
CREATE INDEX idx_rosters_created_by ON rosters(created_by);
