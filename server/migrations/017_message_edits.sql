-- 017: редактирование и удаление сообщений в чате.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Удалённое сообщение остаётся строкой в истории (чтобы порядок и курсоры не
-- ломались), но текст и медиа стираются.
COMMENT ON COLUMN messages.edited_at IS 'Когда автор последний раз правил текст';
COMMENT ON COLUMN messages.deleted_at IS 'Когда автор удалил сообщение (текст и медиа стёрты)';

-- Удалённое голосовое теряет файл, поэтому проверка полей медиа не должна
-- срабатывать для удалённых сообщений.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_voice_payload_check;
ALTER TABLE messages ADD CONSTRAINT messages_voice_payload_check CHECK (
  deleted_at IS NOT NULL
  OR (kind <> 'voice' AND media_url IS NULL AND media_mime IS NULL AND duration_ms IS NULL)
  OR (kind = 'voice' AND media_url IS NOT NULL AND media_mime IS NOT NULL
      AND duration_ms BETWEEN 400 AND 180000)
);
