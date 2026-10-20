-- 030: карточки «стола» эфира (фото, ссылка, заметка, вопрос); живут только пока идёт эфир.
CREATE TABLE IF NOT EXISTS live_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('photo', 'link', 'note', 'question')),
  text            text NOT NULL DEFAULT '' CHECK (char_length(text) <= 500),
  url             text CHECK (url IS NULL OR char_length(url) <= 500),
  media_url       text,
  media_mime      text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  client_temp_id  uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, author_id, client_temp_id),
  CONSTRAINT live_cards_kind_fields CHECK (
    (kind = 'photo' AND media_url IS NOT NULL AND media_mime IS NOT NULL)
    OR (kind = 'link' AND url IS NOT NULL)
    OR (kind IN ('note', 'question') AND char_length(btrim(text)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS live_cards_session_created
  ON live_cards (session_id, created_at);
