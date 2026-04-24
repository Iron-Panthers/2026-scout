-- Add clock-in tracking to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS clocked_in BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS clocked_in_at TIMESTAMPTZ;
