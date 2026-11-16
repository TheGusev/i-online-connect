CREATE TABLE demo_regions (
  id text PRIMARY KEY,
  center_city text NOT NULL CHECK (length(trim(center_city)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only verified directory results may be inserted here. Profile text is not a directory.
CREATE TABLE geo_places (
  id text PRIMARY KEY,
  city text NOT NULL,
  normalized_name text NOT NULL,
  region_id text NOT NULL REFERENCES demo_regions(id),
  source text NOT NULL,
  UNIQUE (normalized_name, region_id)
);
CREATE INDEX geo_places_name_idx ON geo_places(normalized_name);

ALTER TABLE profiles ADD COLUMN geo_place_id text REFERENCES geo_places(id);
ALTER TABLE listings ADD COLUMN region_id text REFERENCES demo_regions(id);
ALTER TABLE spaces ADD COLUMN region_id text REFERENCES demo_regions(id);
ALTER TABLE spaces ADD COLUMN seed_key text;
ALTER TABLE spaces ADD CONSTRAINT spaces_seed_key_requires_seed CHECK (seed_key IS NULL OR is_seed = true);
CREATE UNIQUE INDEX spaces_seed_key_unique ON spaces(seed_key) WHERE seed_key IS NOT NULL;
CREATE INDEX spaces_region_idx ON spaces(region_id);
CREATE INDEX listings_region_idx ON listings(region_id);
