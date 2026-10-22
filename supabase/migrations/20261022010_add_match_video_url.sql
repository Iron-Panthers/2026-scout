-- A YouTube link a manager pastes for a match, shown before any videos from TBA.
-- Useful when TBA hasn't posted the match yet or only the event's livestream is up
-- (a link with ?t= starts the player at that moment). NULL means no pasted link.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS video_url TEXT;
