ALTER TABLE listings ADD COLUMN IF NOT EXISTS author_hidden_at timestamptz;
CREATE INDEX IF NOT EXISTS listings_author_visible_idx
  ON listings (author_id, created_at DESC) WHERE author_hidden_at IS NULL;
