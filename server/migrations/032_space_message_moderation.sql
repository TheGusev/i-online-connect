-- 032: модерация общего чата — кто удалил сообщение сообщества.
-- Мягкое удаление (deleted_at) уже есть с 025; здесь только автор удаления.
ALTER TABLE space_messages
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN space_messages.deleted_by IS 'Кто удалил сообщение: сам автор или организатор сообщества';
