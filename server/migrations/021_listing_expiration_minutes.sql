-- expires_at уже добавлен в 005; сохраняем старые сроки и поддерживаем
-- минутные объявления в новых установках и обновлениях.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day';

ALTER TABLE listings
  ALTER COLUMN expires_at SET DEFAULT now() + interval '1 day';

CREATE INDEX IF NOT EXISTS listings_active_expiry_idx
  ON listings (expires_at) WHERE state = 'active';