-- Только подготовка схемы. Применение согласуется отдельно.
-- До 64 переиспользуемых минутных ячеек на пользователя.
CREATE TABLE notification_activity_slots (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 0 AND 63),
  last_action_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, slot)
);

COMMENT ON TABLE notification_activity_slots IS
  'Недавние активные минуты для уровня автора уведомления; без содержимого сообщений';
