-- Структурированные встречи сообществ: у события появляется описание,
-- чтобы организатор не объявлял встречу текстом в общем чате.
ALTER TABLE space_events
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
