-- Pay each achievement what the app shows for it (ACHIEVEMENT_POINTS in
-- src/lib/achievements.ts). Only affects achievements earned from now on; points already
-- paid out are left as they are.
INSERT INTO achievement_rewards (achievement_id, points) VALUES
  ('first_match', 10),
  ('matches_25', 400),
  ('matches_100', 1000),
  ('matches_250', 3000),
  ('events_1', 25),
  ('events_5', 500),
  ('events_10', 2000),
  ('championship', 100),
  ('seasons_3', 1000),
  ('no_life', 1000),
  ('veteran', 800),
  ('top_scout', 500),
  ('picklist', 100),
  ('match_view', 10),
  ('upset', 150),
  ('mythic', 200),
  ('frcdle_5026', 200),
  ('full_roll', 200000),
  ('collector', 1500)
ON CONFLICT (achievement_id) DO UPDATE SET points = EXCLUDED.points;
