-- 009_seed_content.sql — демо-наполнение платформы.
--
-- Смысл: пустое приложение выглядит мёртвым, поэтому в базе живут примерные
-- анкеты, объявления и сообщества. Они помечены is_seed = true и:
--   • всегда идут после реальных записей;
--   • пропадают из выдачи, когда реальных активных записей стало достаточно;
--   • не участвуют в подборе, уведомлениях и откликах.
--
-- Изменения строго additive: только новые колонки с DEFAULT и индексы.
-- Существующие строки получают is_seed = false, поведение старых клиентов
-- не меняется.

ALTER TABLE profiles       ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false;
ALTER TABLE listings       ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false;
ALTER TABLE spaces         ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false;
ALTER TABLE space_messages ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false;
ALTER TABLE user_needs     ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false;

-- Район объявления: показываем вместо расстояния, координат мы не спрашиваем.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS district text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS profiles_seed_idx ON profiles (is_seed) WHERE is_seed;
CREATE INDEX IF NOT EXISTS spaces_seed_idx   ON spaces (is_seed)   WHERE is_seed;

-- Основной индекс выдачи «Рядом»: реальные записи города и категории.
CREATE INDEX IF NOT EXISTS listings_real_city_category_idx
  ON listings (city, category, created_at DESC)
  WHERE is_seed = false;

CREATE INDEX IF NOT EXISTS listings_seed_idx ON listings (is_seed) WHERE is_seed;
