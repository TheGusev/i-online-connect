-- 045: доска сообщества (карточки фото, ссылка, заметка, вопрос) и отметки «прочитано» для звезды новостей.
-- Карточки хранятся 90 дней, затем удаляются вместе с файлом (см. routes/space-board.ts).
CREATE TABLE IF NOT EXISTS space_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('photo', 'link', 'note', 'question')),
  text            text NOT NULL DEFAULT '' CHECK (char_length(text) <= 500),
  url             text CHECK (url IS NULL OR char_length(url) <= 500),
  media_url       text,
  media_mime      text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  pinned_at       timestamptz,
  client_temp_id  uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, author_id, client_temp_id),
  CONSTRAINT space_posts_kind_fields CHECK (
    (kind = 'photo' AND media_url IS NOT NULL AND media_mime IS NOT NULL)
    OR (kind = 'link' AND url IS NOT NULL)
    OR (kind IN ('note', 'question') AND char_length(btrim(text)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS space_posts_space_created ON space_posts (space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS space_posts_created ON space_posts (created_at);

CREATE TABLE IF NOT EXISTS space_reads (
  space_id      uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);
