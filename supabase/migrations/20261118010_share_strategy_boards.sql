-- Strategy boards sent from one user to another. Boards themselves are saved in each browser;
-- sending one puts a copy here for the recipient, who opens it on their board for that match
-- next to their own drawings. Sending the same match to the same person again replaces the copy.

CREATE TABLE IF NOT EXISTS shared_strategy_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- e.g. "2026mttd_qm12", as the strategy board keys its matches
  match_key TEXT NOT NULL CHECK (char_length(match_key) BETWEEN 1 AND 100),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- The board as the app saves it (match, pages of robots and strokes)
  board JSONB NOT NULL CHECK (jsonb_typeof(board) = 'object' AND octet_length(board::text) <= 2000000),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id),
  UNIQUE (match_key, sender_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_strategy_boards_recipient ON shared_strategy_boards(recipient_id, match_key);

ALTER TABLE shared_strategy_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Senders and recipients can view shared boards" ON shared_strategy_boards;
CREATE POLICY "Senders and recipients can view shared boards"
  ON shared_strategy_boards FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can send boards as themselves" ON shared_strategy_boards;
CREATE POLICY "Users can send boards as themselves"
  ON shared_strategy_boards FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Resending replaces what was sent (recipients' edits stay in their own browser)
DROP POLICY IF EXISTS "Senders can resend their boards" ON shared_strategy_boards;
CREATE POLICY "Senders can resend their boards"
  ON shared_strategy_boards FOR UPDATE USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Senders and recipients can remove shared boards" ON shared_strategy_boards;
CREATE POLICY "Senders and recipients can remove shared boards"
  ON shared_strategy_boards FOR DELETE USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
