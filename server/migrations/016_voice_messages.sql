-- 016: поля голосовых сообщений и ключ идемпотентности отправки.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_temp_id uuid,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_voice_payload_check;
ALTER TABLE messages ADD CONSTRAINT messages_voice_payload_check CHECK (
  (kind <> 'voice' AND media_url IS NULL AND media_mime IS NULL AND duration_ms IS NULL)
  OR
  (kind = 'voice' AND media_url IS NOT NULL AND media_mime IS NOT NULL
    AND duration_ms BETWEEN 400 AND 180000)
);

CREATE UNIQUE INDEX IF NOT EXISTS messages_client_temp_uniq
  ON messages (conversation_id, author_id, client_temp_id)
  WHERE client_temp_id IS NOT NULL;
