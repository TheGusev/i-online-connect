CREATE TABLE geo_directory_sync (
  source text PRIMARY KEY,
  synced_at timestamptz NOT NULL DEFAULT now()
);
