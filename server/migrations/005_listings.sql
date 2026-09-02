-- 005_listings.sql — раздел «Рядом»: объявления, жизненные потребности,
-- уведомления о совпадениях.
--
-- Ничего из знакомств (matching, daily_feed), онбординга, чата и верификации
-- не меняется: новая ветка переиспользует город из profiles, доверие
-- (profiles.trust_level), медиа (profile_media), чат (conversations/messages)
-- и жалобы (reports).
--
-- Все изменения additive: новые таблицы, новое значение enum, новая колонка с
-- DEFAULT. Старые клиенты продолжают работать без правок.

BEGIN;

DO $$ BEGIN
  CREATE TYPE need_category AS ENUM ('sale', 'service', 'leisure', 'travel', 'help');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE listing_state AS ENUM ('active', 'closed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Жалобы на объявления идут в ту же очередь reports.
ALTER TYPE report_source ADD VALUE IF NOT EXISTS 'listing';

-- ── Что человек ищет/предлагает по жизни ────────────────────────────────────
-- Не путать с interests: там хобби для знакомств, здесь — бытовые задачи.
CREATE TABLE IF NOT EXISTS user_needs (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   need_category NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

CREATE INDEX IF NOT EXISTS user_needs_category_idx ON user_needs (category);

-- ── Объявления ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    need_category NOT NULL,
  -- Снимок города автора на момент публикации: переезд не должен «переносить»
  -- старые объявления в другой город.
  city        text NOT NULL,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_minor integer,
  currency    text NOT NULL DEFAULT 'RUB',
  state       listing_state NOT NULL DEFAULT 'active',
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(title) BETWEEN 3 AND 120),
  CHECK (price_minor IS NULL OR price_minor >= 0)
);

CREATE INDEX IF NOT EXISTS listings_search_idx
  ON listings (city, category, state, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_author_idx ON listings (author_id, created_at DESC);

-- Фото объявления — ссылка на уже загруженный через /api/media файл.
CREATE TABLE IF NOT EXISTS listing_media (
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  media_id   uuid NOT NULL REFERENCES profile_media(id) ON DELETE CASCADE,
  position   smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, media_id)
);

-- Отклик открывает обычный диалог: отдельного чата объявлений нет.
CREATE TABLE IF NOT EXISTS listing_responses (
  listing_id      uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, user_id)
);

-- ── In-app уведомления ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- Идемпотентность: повторная публикация/ретрай не плодит дубли.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_listing_unique_idx
  ON notifications (user_id, kind, (payload->>'listingId'))
  WHERE payload->>'listingId' IS NOT NULL;

-- Отдельный тумблер уведомлений про объявления (по умолчанию включён).
ALTER TABLE notification_prefs
  ADD COLUMN IF NOT EXISTS listings boolean NOT NULL DEFAULT true;

INSERT INTO schema_migrations (name) VALUES ('005_listings.sql')
  ON CONFLICT (name) DO NOTHING;

COMMIT;
