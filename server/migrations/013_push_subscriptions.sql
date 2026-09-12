-- 013: подписки на push-уведомления (Web Push, VAPID).
--
-- Один пользователь = несколько устройств, поэтому уникален endpoint, а не
-- user_id. Ключи p256dh/auth выдаёт браузер, они не секреты сервера, но и не
-- публикуются: доступ к таблице только у backend.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions (user_id);
