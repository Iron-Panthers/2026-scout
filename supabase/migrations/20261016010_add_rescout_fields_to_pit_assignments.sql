-- Which pit scouting fields a rescout assignment asks the scouter to redo.
-- NULL means a regular assignment (or a legacy rescout that edits the whole entry).
-- Values are question ids from pitScoutingConfig.ts, plus "photo" for the robot photo.
ALTER TABLE pit_scouting_assignments
  ADD COLUMN IF NOT EXISTS rescout_fields TEXT[];
