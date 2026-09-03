-- Расширение категорий раздела «Рядом».
--
-- Изменение additive: старые значения enum и все существующие строки остаются
-- как есть, добавляются только новые варианты. ADD VALUE IF NOT EXISTS делает
-- миграцию идемпотентной, поэтому повторный запуск безопасен.

ALTER TYPE need_category ADD VALUE IF NOT EXISTS 'dating';
ALTER TYPE need_category ADD VALUE IF NOT EXISTS 'realty';
ALTER TYPE need_category ADD VALUE IF NOT EXISTS 'transport';
ALTER TYPE need_category ADD VALUE IF NOT EXISTS 'urgent';
