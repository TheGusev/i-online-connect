-- 015: новый тип сообщения применяется отдельно, до миграции колонок.
ALTER TYPE message_kind ADD VALUE IF NOT EXISTS 'voice';
