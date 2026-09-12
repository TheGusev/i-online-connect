-- 014: быстрые фильтры и стабильная cursor-пагинация центра уведомлений.
CREATE INDEX IF NOT EXISTS notifications_user_kind_created_idx
  ON notifications (user_id, kind, created_at DESC, id DESC);