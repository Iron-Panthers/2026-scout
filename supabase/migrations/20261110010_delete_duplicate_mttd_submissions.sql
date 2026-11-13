-- At 2026 Madtown Throwdown some quant submissions were uploaded many times over (e.g. 39 copies of
-- one scout's match 66 red3). Keep one submission per match, role and scouter (the latest, so the
-- one scout who resubmitted match 41 with an edited comment keeps the edit) and delete the rest.
-- Deleted rows are copied to a backup table first, so they can be restored if needed.
CREATE TABLE IF NOT EXISTS scouting_submissions_deleted_duplicates (LIKE scouting_submissions INCLUDING ALL);

WITH ranked AS (
  SELECT s.id,
    ROW_NUMBER() OVER (PARTITION BY s.match_id, s.role, s.scouter_id ORDER BY s.created_at DESC, s.id DESC) AS copy
  FROM scouting_submissions s
  JOIN matches m ON m.id = s.match_id
  JOIN events e ON e.id = m.event_id
  WHERE e.event_code = '2026mttd' AND s.scouter_id IS NOT NULL
),
duplicates AS (
  SELECT id FROM ranked WHERE copy > 1
),
backed_up AS (
  INSERT INTO scouting_submissions_deleted_duplicates
  SELECT s.* FROM scouting_submissions s WHERE s.id IN (SELECT id FROM duplicates)
  ON CONFLICT DO NOTHING
  RETURNING id
)
DELETE FROM scouting_submissions WHERE id IN (SELECT id FROM backed_up);

-- With no policies the app can't read it; it's only reachable from the Supabase dashboard
ALTER TABLE scouting_submissions_deleted_duplicates ENABLE ROW LEVEL SECURITY;
