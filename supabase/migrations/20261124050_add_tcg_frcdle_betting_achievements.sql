-- New achievements, recorded by the app when they happen. Keep the points in sync with
-- ACHIEVEMENT_POINTS in src/lib/achievements.ts.
--   mad_collector    "Mad collector": every card in the 2026 Madtown Throwdown pack
--   frcdle_xp_1k     "Roller":  1,000 lifetime FRCdle xP
--   frcdle_xp_10k    "Spinner": 10,000 lifetime FRCdle xP
--   frcdle_xp_100k   "Gambler": 100,000 lifetime FRCdle xP
--   rip              "RIP": 10,000 points lost on bets
INSERT INTO achievement_rewards (achievement_id, points) VALUES
  ('mad_collector', 3000),
  ('frcdle_xp_1k', 100),
  ('frcdle_xp_10k', 1000),
  ('frcdle_xp_100k', 5000),
  ('rip', 500)
ON CONFLICT (achievement_id) DO UPDATE SET points = EXCLUDED.points;
