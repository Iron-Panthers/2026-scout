-- Suggestions can also ask the host to tie a team with another one ('tie', naming the other
-- team in tie_team_number). Only up and down moves take a number of spots.
ALTER TABLE live_picklist_suggestions ADD COLUMN IF NOT EXISTS tie_team_number INTEGER;

ALTER TABLE live_picklist_suggestions DROP CONSTRAINT IF EXISTS live_picklist_suggestions_direction_check;
ALTER TABLE live_picklist_suggestions
  ADD CONSTRAINT live_picklist_suggestions_direction_check
  CHECK (direction IN ('up', 'down', 'to_dnp', 'from_dnp', 'tie'));

ALTER TABLE live_picklist_suggestions DROP CONSTRAINT IF EXISTS live_picklist_suggestions_dnp_spots_check;
ALTER TABLE live_picklist_suggestions
  ADD CONSTRAINT live_picklist_suggestions_dnp_spots_check
  CHECK (direction IN ('up', 'down') OR spots IS NULL);

ALTER TABLE live_picklist_suggestions DROP CONSTRAINT IF EXISTS live_picklist_suggestions_tie_team_check;
ALTER TABLE live_picklist_suggestions
  ADD CONSTRAINT live_picklist_suggestions_tie_team_check
  CHECK ((direction = 'tie') = (tie_team_number IS NOT NULL) AND tie_team_number IS DISTINCT FROM team_number);
