-- Демо-объявления показывают разное число откликов без настоящих диалогов.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS seed_responses integer NOT NULL DEFAULT 0;
