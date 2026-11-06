-- Every new suggestion must attach evidence: part of a qualification match's YouTube video,
-- as whole seconds into that video. NOT VALID, so suggestions sent before this keep working.
ALTER TABLE live_picklist_suggestions
  ADD COLUMN IF NOT EXISTS evidence_match_number INTEGER,
  ADD COLUMN IF NOT EXISTS evidence_video_id TEXT,
  ADD COLUMN IF NOT EXISTS evidence_start INTEGER,
  ADD COLUMN IF NOT EXISTS evidence_end INTEGER;

ALTER TABLE live_picklist_suggestions DROP CONSTRAINT IF EXISTS live_picklist_suggestions_evidence_check;
ALTER TABLE live_picklist_suggestions
  ADD CONSTRAINT live_picklist_suggestions_evidence_check
  CHECK (
    evidence_match_number IS NOT NULL AND evidence_match_number > 0
    AND evidence_video_id IS NOT NULL AND evidence_video_id ~ '^[A-Za-z0-9_-]{11}$'
    AND evidence_start IS NOT NULL AND evidence_start >= 0
    AND evidence_end IS NOT NULL AND evidence_end > evidence_start
  ) NOT VALID;
