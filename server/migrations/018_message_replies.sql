-- 018: ответы на сообщения (цитата в чате).
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS messages_reply_to_id_idx ON messages (reply_to_id);

COMMENT ON COLUMN messages.reply_to_id IS 'Сообщение, на которое отвечает это (цитата)';
