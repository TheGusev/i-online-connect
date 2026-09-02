-- 004: подтверждение email и телефона + обращения в поддержку.
--
-- Коды подтверждения хранятся только в виде SHA-256 хэша: даже с доступом
-- к базе восстановить код нельзя. Живут 15 минут, максимум 5 попыток ввода.

CREATE TABLE IF NOT EXISTS contact_confirmations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  channel      text NOT NULL CHECK (channel IN ('email', 'phone')),
  destination  text NOT NULL,
  code_hash    text NOT NULL,
  attempts     int  NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_confirmations_lookup_idx
  ON contact_confirmations (user_id, channel, created_at DESC);

-- Обращения в поддержку с публичной страницы /support.
-- user_id заполняется, если человек был авторизован.
CREATE TABLE IF NOT EXISTS support_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
  email      text NOT NULL,
  topic      text NOT NULL,
  message    text NOT NULL,
  status     text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'closed')),
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_requests_created_idx
  ON support_requests (created_at DESC);
