-- Whether a user wants push notifications for new messages (the "Messages" toggle in
-- Settings). Off until they turn it on, like the other notification toggles; the
-- send-message-notification edge function skips anyone who has it off.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS message_notifications BOOLEAN NOT NULL DEFAULT false;
