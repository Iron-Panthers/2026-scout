-- Add a "developer" role, mirroring is_manager: a separate boolean flag
-- gates access (not the free-text `role` label), so a user can be flagged
-- as a developer without changing what `role` displays as.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_developer BOOLEAN NOT NULL DEFAULT false;
