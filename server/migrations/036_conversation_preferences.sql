CREATE TABLE IF NOT EXISTS conversation_preferences (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  pinned_at timestamptz,
  is_favorite boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, conversation_id)
);
CREATE INDEX IF NOT EXISTS conversation_preferences_pinned_idx
  ON conversation_preferences(user_id, pinned_at DESC) WHERE pinned_at IS NOT NULL;