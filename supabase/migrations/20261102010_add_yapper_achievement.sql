-- "Yapper": write 200 words in one scouting comment, recorded by the app when the
-- scouting is submitted.
-- Keep the points in sync with ACHIEVEMENT_POINTS in src/lib/achievements.ts.
INSERT INTO achievement_rewards (achievement_id, points) VALUES
  ('yapper', 50)
ON CONFLICT (achievement_id) DO UPDATE SET points = EXCLUDED.points;
