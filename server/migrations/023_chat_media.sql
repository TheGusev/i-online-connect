-- 023: фото и видео в личных диалогах и в общем чате сообщества.
-- Новых колонок не нужно: media_url / media_mime / duration_ms уже добавлены
-- для голосовых (016, 020). Здесь только расширяем допустимые значения.

-- Личные диалоги: фото без длительности, видео — до 60 секунд.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_voice_payload_check;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_media_payload_check;
ALTER TABLE messages ADD CONSTRAINT messages_media_payload_check CHECK (
  -- Удалённое сообщение теряет медиа: текст и файл стираются у обоих участников.
  deleted_at IS NOT NULL
  OR (kind IN ('text', 'meeting')
      AND media_url IS NULL AND media_mime IS NULL AND duration_ms IS NULL)
  OR (kind = 'voice' AND media_url IS NOT NULL AND media_mime IS NOT NULL
      AND duration_ms BETWEEN 400 AND 180000)
  OR (kind = 'image' AND media_url IS NOT NULL AND media_mime IS NOT NULL
      AND duration_ms IS NULL)
  OR (kind = 'video' AND media_url IS NOT NULL AND media_mime IS NOT NULL
      AND duration_ms BETWEEN 200 AND 61000)
);

-- Общий чат сообщества: kind здесь текстовая колонка, а не enum.
ALTER TABLE space_messages DROP CONSTRAINT IF EXISTS space_messages_kind_check;
ALTER TABLE space_messages ADD CONSTRAINT space_messages_kind_check
  CHECK (kind IN ('text', 'voice', 'image', 'video'));

ALTER TABLE space_messages DROP CONSTRAINT IF EXISTS space_messages_voice_payload_check;
ALTER TABLE space_messages DROP CONSTRAINT IF EXISTS space_messages_media_payload_check;
ALTER TABLE space_messages ADD CONSTRAINT space_messages_media_payload_check CHECK (
  (kind = 'text' AND media_url IS NULL AND media_mime IS NULL AND duration_ms IS NULL)
  OR (kind = 'voice' AND media_url IS NOT NULL AND media_mime IS NOT NULL
      AND duration_ms BETWEEN 400 AND 180000)
  OR (kind = 'image' AND media_url IS NOT NULL AND media_mime IS NOT NULL
      AND duration_ms IS NULL)
  OR (kind = 'video' AND media_url IS NOT NULL AND media_mime IS NOT NULL
      AND duration_ms BETWEEN 200 AND 61000)
);
