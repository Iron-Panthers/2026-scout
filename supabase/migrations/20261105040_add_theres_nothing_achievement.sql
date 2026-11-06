-- "There's Nothing." (hidden): spin an FRCdle number without a single team in it, recorded
-- by the app once the roll's teams are worked out.
-- Keep the points in sync with ACHIEVEMENT_POINTS in src/lib/achievements.ts.
INSERT INTO achievement_rewards (achievement_id, points) VALUES
  ('theres_nothing', 1500)
ON CONFLICT (achievement_id) DO UPDATE SET points = EXCLUDED.points;
