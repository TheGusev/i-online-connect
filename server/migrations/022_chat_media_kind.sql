-- 022: новые типы сообщений применяются отдельно, до миграции колонок.
-- PostgreSQL не разрешает использовать новое значение enum в той же транзакции,
-- в которой оно добавлено, поэтому ограничения живут в 023_chat_media.sql.
ALTER TYPE message_kind ADD VALUE IF NOT EXISTS 'image';
ALTER TYPE message_kind ADD VALUE IF NOT EXISTS 'video';
