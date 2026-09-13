-- 017: редактирование и удаление сообщений в чате.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Удалённое сообщение остаётся строкой в истории (чтобы порядок и курсоры не
-- ломались), но текст и медиа стираются.
COMMENT ON COLUMN messages.edited_at IS 'Когда автор последний раз правил текст';
COMMENT ON COLUMN messages.deleted_at IS 'Когда автор удалил сообщение (текст и медиа стёрты)';
