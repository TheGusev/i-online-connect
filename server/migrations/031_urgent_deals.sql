-- Additive urgent deals; no changes to historic migrations.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS urgent_type text CHECK (urgent_type IN ('sell','buy','help','ride','giveaway'));
ALTER TABLE listings ADD COLUMN IF NOT EXISTS market_price_minor integer CHECK (market_price_minor >= 0);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_start_minor integer CHECK (price_start_minor >= 0);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS price_floor_minor integer CHECK (price_floor_minor >= 10000);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN ('sold','given','done','expired','cancelled'));
ALTER TABLE listings ADD COLUMN IF NOT EXISTS final_price_minor integer CHECK (final_price_minor >= 0);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS closed_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_sell_prices_check' AND conrelid = 'listings'::regclass) THEN
    ALTER TABLE listings ADD CONSTRAINT listings_sell_prices_check CHECK (urgent_type IS DISTINCT FROM 'sell' OR
      (category = 'urgent' AND price_start_minor IS NOT NULL AND price_floor_minor IS NOT NULL
       AND price_floor_minor <= price_start_minor AND price_start_minor::bigint*2 <= price_floor_minor::bigint*3));
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.listing_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
 buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, price_minor integer NOT NULL CHECK (price_minor >= 0),
 source text NOT NULL CHECK (source IN ('manual','auto')), status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','completed','no_show')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
-- Standalone PostgreSQL: application connection role only; no public Data API.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_reservations TO CURRENT_USER;
CREATE UNIQUE INDEX IF NOT EXISTS listing_reservations_one_active ON listing_reservations(listing_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS listing_reservations_buyer_idx ON listing_reservations(buyer_id, created_at DESC);
CREATE TABLE IF NOT EXISTS public.listing_bids (
 listing_id uuid REFERENCES listings(id) ON DELETE CASCADE, buyer_id uuid REFERENCES users(id) ON DELETE CASCADE,
 max_price_minor integer NOT NULL CHECK (max_price_minor >= 0), status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','won','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(listing_id,buyer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_bids TO CURRENT_USER;
CREATE TABLE IF NOT EXISTS public.listing_watchers (
 listing_id uuid REFERENCES listings(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(listing_id,user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_watchers TO CURRENT_USER;
CREATE TABLE IF NOT EXISTS public.listing_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid REFERENCES listings(id) ON DELETE CASCADE,
 user_id uuid, kind text NOT NULL, meta jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_events TO CURRENT_USER;
CREATE INDEX IF NOT EXISTS listing_events_kind_idx ON listing_events(listing_id,kind,created_at);
