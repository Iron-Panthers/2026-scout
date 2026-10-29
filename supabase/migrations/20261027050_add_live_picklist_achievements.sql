-- Two live picklist achievements, recorded by the app as they happen:
--   live_picklist        "Picklister": open the live picklist
--   picklist_suggestion  "Erm... ackshually...": suggest a move in the live picklist
-- Keep the points in sync with ACHIEVEMENT_POINTS in src/lib/achievements.ts.
INSERT INTO achievement_rewards (achievement_id, points) VALUES
  ('live_picklist', 10),
  ('picklist_suggestion', 25)
ON CONFLICT (achievement_id) DO UPDATE SET points = EXCLUDED.points;
