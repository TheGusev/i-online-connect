-- ─────────────────────────────────────────────────────────────────────────────
-- 006_admin.sql — роли, блокировка аккаунтов админом, журнал действий админа.
--
-- Все изменения additive: новый enum, новые колонки с DEFAULT, новая таблица.
-- Старые клиенты и старые DTO продолжают работать без правок.
--
-- Роль хранится в users, а не в профиле, и никогда не приходит от клиента:
-- выдать её можно только скриптом server/scripts/grant-admin.mjs.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'user',
  -- Блокировка модератором. Не путать с таблицей blocks: та про то,
  -- что двое пользователей не хотят видеть друг друга.
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text;

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role) WHERE role <> 'user';
CREATE INDEX IF NOT EXISTS users_blocked_idx ON users (blocked_at) WHERE blocked_at IS NOT NULL;

-- Журнал действий администраторов: кто, что, когда, над каким объектом.
CREATE TABLE IF NOT EXISTS admin_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text NOT NULL CHECK (
    target_type IN ('user', 'report', 'verification', 'support', 'listing', 'space')
  ),
  target_id   uuid,
  note        text NOT NULL DEFAULT '',
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_actions_recent_idx ON admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON admin_actions (target_type, target_id);

-- Ответ модератора на обращение в поддержку (уходит письмом заявителю).
ALTER TABLE support_requests
  ADD COLUMN IF NOT EXISTS reply       text,
  ADD COLUMN IF NOT EXISTS replied_at  timestamptz,
  ADD COLUMN IF NOT EXISTS replied_by  uuid REFERENCES users(id) ON DELETE SET NULL;
