-- Suggestions can say why the change should be made; the host opens it from the suggestion.
ALTER TABLE live_picklist_suggestions ADD COLUMN IF NOT EXISTS reason TEXT;

ALTER TABLE live_picklist_suggestions DROP CONSTRAINT IF EXISTS live_picklist_suggestions_reason_length_check;
ALTER TABLE live_picklist_suggestions
  ADD CONSTRAINT live_picklist_suggestions_reason_length_check
  CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500);
