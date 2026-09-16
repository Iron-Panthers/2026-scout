-- Add event_points column to game_profiles: a separate currency balance,
-- independent from the main `points` balance, spent on event-exclusive
-- cosmetics in the Shop's "Event" tab (only shown during an active event).
ALTER TABLE game_profiles
  ADD COLUMN IF NOT EXISTS event_points INTEGER NOT NULL DEFAULT 0 CHECK (event_points >= 0);
