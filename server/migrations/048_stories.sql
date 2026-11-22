CREATE TABLE story_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_temp_id uuid NOT NULL,
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('image', 'video')),
  file_key text NOT NULL UNIQUE,
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'video/mp4')),
  file_size integer NOT NULL CHECK (file_size > 0 AND file_size <= 47185920),
  duration_ms integer,
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  deleted_at timestamptz,
  UNIQUE (author_id, client_temp_id),
  CHECK (expires_at > created_at),
  CHECK (
    (kind = 'image' AND mime = 'image/jpeg' AND duration_ms IS NULL)
    OR
    (kind = 'video' AND mime = 'video/mp4' AND duration_ms BETWEEN 200 AND 30000)
  )
);

-- Снимок аудитории при публикации: новые контакты не получают старые истории.
CREATE TABLE story_audience (
  story_id uuid NOT NULL REFERENCES story_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, user_id)
);

CREATE TABLE story_views (
  story_id uuid NOT NULL REFERENCES story_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);

CREATE INDEX story_posts_author_created
  ON story_posts(author_id, created_at DESC, id DESC);
CREATE INDEX story_posts_expiration ON story_posts(expires_at);
CREATE INDEX story_audience_viewer ON story_audience(user_id, story_id);
