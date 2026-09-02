-- ─────────────────────────────────────────────────────────────────────────────
-- 007_admin_totp.sql — второй фактор для входа в админку.
--
-- Все изменения additive: новые колонки с DEFAULT NULL и новая таблица.
-- Обычные пользователи и старые DTO не затронуты.
--
-- Секрет TOTP хранится ЗАШИФРОВАННЫМ (AES-256-GCM, ключ TOTP_ENCRYPTION_KEY
-- из окружения): дамп базы без ключа не даёт войти в админку.
-- Привязку делает только скрипт server/scripts/grant-admin.mjs на сервере,
-- HTTP-эндпоинта для выдачи секрета нет и быть не должно.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users
  -- Формат: v1:<iv base64url>:<tag base64url>:<ciphertext base64url>
  ADD COLUMN IF NOT EXISTS totp_secret        text,
  ADD COLUMN IF NOT EXISTS totp_confirmed_at  timestamptz;

-- Использованные коды TOTP: один код нельзя применить дважды
-- (защита от перехвата кода и повтора запроса).
CREATE TABLE IF NOT EXISTS totp_used_codes (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Не сам код, а его SHA-256: в базе кодов в открытом виде не держим.
  code_hash  text NOT NULL,
  -- Номер 30-секундного шага, для которого код был принят.
  step       bigint NOT NULL,
  used_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, code_hash, step)
);

CREATE INDEX IF NOT EXISTS totp_used_codes_cleanup_idx ON totp_used_codes (used_at);

-- Попытки входа в админку: отдельно от login_attempts, чтобы очередь
-- перебора по админке была видна сразу.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id         bigserial PRIMARY KEY,
  email      citext,
  ip         text,
  -- 'password' | 'role' | 'totp' | 'ok' — на каком шаге остановились.
  outcome    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_login_attempts_recent_idx
  ON admin_login_attempts (created_at DESC);
