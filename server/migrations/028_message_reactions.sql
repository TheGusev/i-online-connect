-- 028: реакции на сообщения личных чатов и сообществ (видны всем участникам).
-- Повторяемая: все объекты создаются через IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_unique UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON message_reactions (message_id);

CREATE TABLE IF NOT EXISTS space_message_reactions (
  message_id uuid NOT NULL REFERENCES space_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT space_message_reactions_unique UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS space_message_reactions_message_idx ON space_message_reactions (message_id);

COMMENT ON TABLE message_reactions IS 'Реакции на сообщения личных диалогов';
COMMENT ON TABLE space_message_reactions IS 'Реакции на сообщения чатов сообществ';
