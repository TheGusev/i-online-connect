-- Льготный период для refresh-токенов: после ротации старый токен ещё 60 секунд
-- принимается, чтобы параллельные запросы /auth/refresh не выкидывали из аккаунта.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS rotated_at timestamptz NULL;
