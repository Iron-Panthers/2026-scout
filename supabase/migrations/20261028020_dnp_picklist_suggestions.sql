-- Suggestions can also ask the host to move a team into DNP Teams ('to_dnp') or back out
-- of it ('from_dnp'). Those don't take a number of spots.
ALTER TABLE live_picklist_suggestions DROP CONSTRAINT IF EXISTS live_picklist_suggestions_direction_check;
ALTER TABLE live_picklist_suggestions
  ADD CONSTRAINT live_picklist_suggestions_direction_check
  CHECK (direction IN ('up', 'down', 'to_dnp', 'from_dnp'));

ALTER TABLE live_picklist_suggestions DROP CONSTRAINT IF EXISTS live_picklist_suggestions_dnp_spots_check;
ALTER TABLE live_picklist_suggestions
  ADD CONSTRAINT live_picklist_suggestions_dnp_spots_check
  CHECK (direction IN ('up', 'down') OR spots IS NULL);
