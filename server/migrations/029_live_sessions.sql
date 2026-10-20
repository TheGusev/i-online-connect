-- 029: сессии эфира и временные клипы (живут только пока идёт эфир).
CREATE TABLE IF NOT EXISTS live_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  started_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  mode        text NOT NULL DEFAULT 'talk',
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS live_sessions_one_active
  ON live_sessions (space_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS live_clips (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_temp_id  uuid NOT NULL,
  media_url       text NOT NULL,
  media_mime      text NOT NULL CHECK (media_mime IN ('audio/webm', 'audio/mp4')),
  duration_ms     integer NOT NULL CHECK (duration_ms BETWEEN 400 AND 180000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, author_id, client_temp_id)
);

CREATE INDEX IF NOT EXISTS live_clips_session_created
  ON live_clips (session_id, created_at);
