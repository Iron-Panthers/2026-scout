-- How many scouters are assigned to each robot (role) per match at this event.
-- 2 keeps the primary + co-scout slots in the manager's assignment grid; 1 shows
-- only the primary slot. Existing events default to 2, matching how the grid
-- worked before this setting existed.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS scouters_per_robot SMALLINT NOT NULL DEFAULT 2
    CHECK (scouters_per_robot IN (1, 2));
