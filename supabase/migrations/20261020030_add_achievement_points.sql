-- Points for achievements: each achievement pays its points once, the moment it's
-- recorded in user_achievements, added to the scouter's points balance (game_profiles).
-- Paid by the database so it can't happen twice, and the amounts live here, not in the app.
--
-- Keep these in sync with `points` on each achievement in src/lib/achievements.ts
-- (that copy is only for showing the amounts).
CREATE TABLE IF NOT EXISTS achievement_rewards (
  achievement_id TEXT PRIMARY KEY,
  points INTEGER NOT NULL CHECK (points >= 0)
);

ALTER TABLE achievement_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view achievement rewards" ON achievement_rewards;
CREATE POLICY "Authenticated users can view achievement rewards"
  ON achievement_rewards FOR SELECT USING (auth.uid() IS NOT NULL);

INSERT INTO achievement_rewards (achievement_id, points) VALUES
  ('first_match', 25),
  ('matches_25', 50),
  ('matches_100', 150),
  ('matches_250', 300),
  ('events_1', 25),
  ('events_5', 100),
  ('events_10', 250),
  ('championship', 200),
  ('seasons_3', 150),
  ('no_life', 250),
  ('veteran', 150),
  ('top_scout', 150),
  ('picklist', 75),
  ('match_view', 25),
  ('upset', 150),
  ('mythic', 300),
  ('frcdle_5026', 200),
  ('full_roll', 1000),
  ('collector', 500)
ON CONFLICT (achievement_id) DO UPDATE SET points = EXCLUDED.points;

-- Only real achievements can be recorded (an unknown id would never pay, and isn't one)
ALTER TABLE user_achievements DROP CONSTRAINT IF EXISTS user_achievements_known_achievement;
ALTER TABLE user_achievements
  ADD CONSTRAINT user_achievements_known_achievement
  FOREIGN KEY (achievement_id) REFERENCES achievement_rewards(achievement_id);

CREATE OR REPLACE FUNCTION award_achievement_points()
RETURNS TRIGGER AS $$
DECLARE
  reward INTEGER;
BEGIN
  SELECT points INTO reward FROM achievement_rewards WHERE achievement_id = NEW.achievement_id;
  IF COALESCE(reward, 0) <= 0 THEN RETURN NEW; END IF;
  INSERT INTO game_profiles (user_id, points)
  VALUES (NEW.user_id, reward)
  ON CONFLICT (user_id) DO UPDATE SET points = game_profiles.points + EXCLUDED.points;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_achievement_earned ON user_achievements;
CREATE TRIGGER on_achievement_earned
  AFTER INSERT ON user_achievements
  FOR EACH ROW EXECUTE FUNCTION award_achievement_points();

-- Achievements already recorded before points existed pay out now
INSERT INTO game_profiles (user_id, points)
SELECT ua.user_id, SUM(ar.points)
FROM user_achievements ua JOIN achievement_rewards ar USING (achievement_id)
GROUP BY ua.user_id
ON CONFLICT (user_id) DO UPDATE SET points = game_profiles.points + EXCLUDED.points;
