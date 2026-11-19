-- Комментарии и реакции относятся к материалам доски.
-- Существующая история space_messages не изменяется.

ALTER TABLE space_posts
  ADD COLUMN comments_closed boolean NOT NULL DEFAULT false;

CREATE TABLE space_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES space_posts(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  parent_id uuid,
  text text NOT NULL
    CHECK (char_length(btrim(text)) BETWEEN 1 AND 2000),
  client_temp_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (post_id, author_id, client_temp_id),
  UNIQUE (post_id, id),
  CONSTRAINT space_post_comment_parent_same_post
    FOREIGN KEY (post_id, parent_id)
    REFERENCES space_post_comments(post_id, id),
  CONSTRAINT space_post_comment_not_own_parent
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX space_post_comments_post_created
  ON space_post_comments(post_id, created_at, id);

CREATE TABLE space_post_reactions (
  post_id uuid NOT NULL REFERENCES space_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction text NOT NULL
    CHECK (reaction IN ('like', 'thanks', 'idea', 'question')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
