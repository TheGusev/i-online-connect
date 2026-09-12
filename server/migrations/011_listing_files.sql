-- 011: фото объявлений живут отдельно от фото профиля.
--
-- Раньше форма «Рядом» грузила снимки через /api/media, то есть в profile_media,
-- и они появлялись в галерее профиля. Теперь у объявлений своё хранилище:
-- listing_files. Старые связи через profile_media остаются рабочими
-- (media_id), новые пишутся в file_id — совместимость не ломается.

CREATE TABLE IF NOT EXISTS listing_files (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listing_files_user_idx ON listing_files (user_id, created_at DESC);

ALTER TABLE listing_media
  ADD COLUMN IF NOT EXISTS file_id uuid REFERENCES listing_files(id) ON DELETE CASCADE;

-- media_id перестаёт быть обязательным, поэтому старый составной ключ заменяем
-- на уникальность позиции внутри объявления.
ALTER TABLE listing_media DROP CONSTRAINT IF EXISTS listing_media_pkey;
ALTER TABLE listing_media ALTER COLUMN media_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listing_media_source_check'
  ) THEN
    ALTER TABLE listing_media
      ADD CONSTRAINT listing_media_source_check
      CHECK (media_id IS NOT NULL OR file_id IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS listing_media_position_idx
  ON listing_media (listing_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS listing_media_media_idx
  ON listing_media (listing_id, media_id) WHERE media_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS listing_media_file_idx
  ON listing_media (listing_id, file_id) WHERE file_id IS NOT NULL;
