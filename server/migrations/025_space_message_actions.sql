-- 025: ответы, редактирование и мягкое удаление сообщений общего чата.
ALTER TABLE space_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES space_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS space_messages_reply_to_idx
  ON space_messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

ALTER TABLE space_messages DROP CONSTRAINT IF EXISTS space_messages_media_payload_check;
ALTER TABLE space_messages ADD CONSTRAINT space_messages_media_payload_check CHECK (
  deleted_at IS NOT NULL
  OR (kind = 'text' AND media_url IS NULL AND media_mime IS NULL AND duration_ms IS NULL)
  OR (kind = 'voice' AND media_url IS NOT NULL AND media_mime IS NOT NULL
      AND duration_ms BETWEEN 400 AND 180000)
  OR (kind = 'image' AND media_url IS NOT NULL AND media_mime IS NOT NULL
      AND duration_ms IS NULL)
  OR (kind = 'video' AND media_url IS NOT NULL AND media_mime IS NOT NULL
      AND duration_ms BETWEEN 200 AND 61000)
);

COMMENT ON COLUMN space_messages.reply_to_id IS 'Сообщение того же сообщества, на которое отвечает автор';
COMMENT ON COLUMN space_messages.edited_at IS 'Когда автор последний раз изменил текст';
COMMENT ON COLUMN space_messages.deleted_at IS 'Когда автор или организатор мягко удалил сообщение';