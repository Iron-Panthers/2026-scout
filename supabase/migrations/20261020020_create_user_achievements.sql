-- Achievements earned from things only the scouter can see (FRCdle rolls, owned
-- cosmetics, picklists, bets, pages they've opened), saved the moment they're earned so
-- other scouters can see them on the profile too. Achievements worked out from public
-- profile data (matches, events, team years) aren't stored here.
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can see anyone's achievements
DROP POLICY IF EXISTS "Authenticated users can view achievements" ON user_achievements;
CREATE POLICY "Authenticated users can view achievements"
  ON user_achievements FOR SELECT USING (auth.uid() IS NOT NULL);

-- You earn your own (the app records them as they happen); they're never taken away
DROP POLICY IF EXISTS "Users can record their own achievements" ON user_achievements;
CREATE POLICY "Users can record their own achievements"
  ON user_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);
