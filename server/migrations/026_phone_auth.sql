-- Вход по номеру телефона (SMS-код). Только добавления: старые аккаунты не меняются.

-- Почта и пароль больше не обязательны, но хотя бы один способ входа должен быть.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_login_method_chk
    CHECK (email IS NOT NULL OR phone IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Номер в формате E.164 (+79991234567), один номер — один аккаунт.
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uidx ON users (phone) WHERE phone IS NOT NULL;

-- Одноразовые коды: храним только HMAC-хеш, сам код в базу не попадает.
CREATE TABLE IF NOT EXISTS auth_otps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text NOT NULL,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  ip           text
);
CREATE INDEX IF NOT EXISTS auth_otps_phone_idx ON auth_otps (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_otps_ip_idx ON auth_otps (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_otps_created_idx ON auth_otps (created_at);

-- Внешние способы входа. Пока используется только phone; telegram/apple — на будущее.
CREATE TABLE IF NOT EXISTS user_identities (
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider IN ('phone', 'telegram', 'apple')),
  provider_user_id  text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS user_identities_user_idx ON user_identities (user_id);

-- Уже подтверждённые телефоны переносим в identities.
INSERT INTO user_identities (user_id, provider, provider_user_id)
SELECT id, 'phone', phone FROM users
 WHERE phone IS NOT NULL AND phone_verified = true AND phone ~ '^\+[1-9][0-9]{7,14}$'
ON CONFLICT DO NOTHING;
