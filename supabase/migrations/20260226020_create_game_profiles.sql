-- Create game_profiles table for the in-app economy system
-- Tracks each user's point balance and which games they have unlocked
CREATE TABLE IF NOT EXISTS game_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  unlocked_games TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT points_non_negative CHECK (points >= 0)
);

-- Enable Row Level Security
ALTER TABLE game_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own game profile
CREATE POLICY "Users can view own game profile" ON game_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own game profile (for purchasing games)
CREATE POLICY "Users can update own game profile" ON game_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can insert their own game profile (auto-created on first visit)
CREATE POLICY "Users can insert own game profile" ON game_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Managers can view any game profile (for awarding points / leaderboard)
CREATE POLICY "Managers can view all game profiles" ON game_profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true
  ));

-- Managers can update any game profile (to award points)
CREATE POLICY "Managers can update any game profile" ON game_profiles FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_manager = true
  ));

-- Index for fast user lookups
CREATE INDEX idx_game_profiles_user_id ON game_profiles(user_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_game_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER game_profiles_updated_at
  BEFORE UPDATE ON game_profiles
  FOR EACH ROW EXECUTE FUNCTION update_game_profiles_updated_at();
