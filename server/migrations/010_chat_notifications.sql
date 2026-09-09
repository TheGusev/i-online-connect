-- 010: полноценные чаты между реальными пользователями.
--
-- * История с курсором: индекс под ORDER BY created_at DESC, id DESC.
-- * Один диалог на пару (match_id уникален), чтобы повторный лайк не плодил
--   пустые диалоги. Существующие дубли схлопываем в самый ранний.
-- * Уведомления kind='new_message' помечаются прочитанными по conversationId —
--   частичный индекс по payload.

-- Дубли по match_id: переносим сообщения/участников в самый ранний диалог.
WITH ranked AS (
  SELECT id, match_id,
         first_value(id) OVER (PARTITION BY match_id ORDER BY created_at, id) AS keep_id
    FROM conversations
   WHERE match_id IS NOT NULL
), dupes AS (
  SELECT id, keep_id FROM ranked WHERE id <> keep_id
)
UPDATE messages m SET conversation_id = d.keep_id
  FROM dupes d WHERE m.conversation_id = d.id;

WITH ranked AS (
  SELECT id, match_id,
         first_value(id) OVER (PARTITION BY match_id ORDER BY created_at, id) AS keep_id
    FROM conversations
   WHERE match_id IS NOT NULL
), dupes AS (
  SELECT id, keep_id FROM ranked WHERE id <> keep_id
)
DELETE FROM conversations c USING dupes d WHERE c.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_match_id_uniq
  ON conversations (match_id) WHERE match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_conversation_created_desc_idx
  ON messages (conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS notifications_conversation_idx
  ON notifications (user_id, (payload->>'conversationId'))
  WHERE kind = 'new_message' AND read_at IS NULL;
