-- Direct messages between any two users (scouts and managers alike).
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at DESC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- You can see the messages you sent or received...
DROP POLICY IF EXISTS "Users can view their own messages" ON messages;
CREATE POLICY "Users can view their own messages"
  ON messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- ...and send messages as yourself (unread to begin with).
DROP POLICY IF EXISTS "Users can send messages as themselves" ON messages;
CREATE POLICY "Users can send messages as themselves"
  ON messages FOR INSERT WITH CHECK (auth.uid() = sender_id AND read_at IS NULL);

-- No update/delete policies: messages can't be edited, and read receipts go through
-- mark_messages_read() below so recipients can't rewrite what was sent to them.

-- Marks every unread message from p_sender to the caller as read.
CREATE OR REPLACE FUNCTION mark_messages_read(p_sender UUID)
RETURNS VOID AS $$
  UPDATE messages SET read_at = now()
  WHERE recipient_id = auth.uid() AND sender_id = p_sender AND read_at IS NULL;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION mark_messages_read(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_messages_read(UUID) TO authenticated;

-- Everyone you can message: every other user's name, avatar and whether they're a
-- manager. (Goes through a function so this doesn't depend on profiles' own policies.)
CREATE OR REPLACE FUNCTION list_message_contacts()
RETURNS TABLE (id UUID, name TEXT, avatar_url TEXT, is_manager BOOLEAN) AS $$
  SELECT p.id, COALESCE(NULLIF(p.name, ''), 'Unknown'), p.avatar_url, COALESCE(p.is_manager, false)
  FROM profiles p
  WHERE auth.uid() IS NOT NULL AND p.id <> auth.uid()
  ORDER BY p.is_manager DESC, p.name;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION list_message_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_message_contacts() TO authenticated;

-- Live updates for new messages and read receipts (skipped if already published)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

-- ── Push notification for the recipient ─────────────────────────────────────
-- Same setup as match assignment pushes (20260226010): pg_net calls the
-- send-message-notification edge function, which needs app.settings.supabase_url and
-- app.settings.service_role_key configured. Skipped silently until they are.
CREATE OR REPLACE FUNCTION notify_message_push()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url TEXT := current_setting('app.settings.supabase_url', true);
  svc_role_key TEXT := current_setting('app.settings.service_role_key', true);
BEGIN
  IF supabase_url IS NULL OR svc_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/send-message-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || svc_role_key
    ),
    body := jsonb_build_object(
      'messageId',   NEW.id,
      'senderId',    NEW.sender_id,
      'recipientId', NEW.recipient_id,
      'body',        left(NEW.body, 200)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_message_sent ON messages;
CREATE TRIGGER on_message_sent
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_message_push();
