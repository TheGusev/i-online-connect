ALTER TYPE message_kind ADD VALUE IF NOT EXISTS 'file';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size integer;
ALTER TABLE space_messages ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE space_messages ADD COLUMN IF NOT EXISTS file_size integer;

-- Compare enum as text: the new enum value is committed only after this migration.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_media_payload_check;
ALTER TABLE messages ADD CONSTRAINT messages_media_payload_check CHECK (
  deleted_at IS NOT NULL
  OR (kind::text IN ('text','meeting') AND media_url IS NULL AND media_mime IS NULL AND duration_ms IS NULL)
  OR (kind::text = 'voice' AND media_url IS NOT NULL AND media_mime IS NOT NULL AND duration_ms BETWEEN 400 AND 180000)
  OR (kind::text = 'image' AND media_url IS NOT NULL AND media_mime IS NOT NULL AND duration_ms IS NULL)
  OR (kind::text = 'video' AND media_url IS NOT NULL AND media_mime IS NOT NULL AND duration_ms BETWEEN 200 AND 61000)
  OR (kind::text = 'file' AND media_url IS NOT NULL AND media_mime IS NOT NULL AND duration_ms IS NULL
      AND file_name IS NOT NULL AND file_size IS NOT NULL AND length(file_name) BETWEEN 1 AND 120 AND file_size BETWEEN 1 AND 26214400)
);
ALTER TABLE space_messages DROP CONSTRAINT IF EXISTS space_messages_kind_check;
ALTER TABLE space_messages ADD CONSTRAINT space_messages_kind_check CHECK (kind IN ('text','voice','image','video','file'));
ALTER TABLE space_messages DROP CONSTRAINT IF EXISTS space_messages_media_payload_check;
ALTER TABLE space_messages ADD CONSTRAINT space_messages_media_payload_check CHECK (
  deleted_at IS NOT NULL
  OR (kind = 'text' AND media_url IS NULL AND media_mime IS NULL AND duration_ms IS NULL)
  OR (kind = 'voice' AND media_url IS NOT NULL AND media_mime IS NOT NULL AND duration_ms BETWEEN 400 AND 180000)
  OR (kind = 'image' AND media_url IS NOT NULL AND media_mime IS NOT NULL AND duration_ms IS NULL)
  OR (kind = 'video' AND media_url IS NOT NULL AND media_mime IS NOT NULL AND duration_ms BETWEEN 200 AND 61000)
  OR (kind = 'file' AND media_url IS NOT NULL AND media_mime IS NOT NULL AND duration_ms IS NULL
      AND file_name IS NOT NULL AND file_size IS NOT NULL AND length(file_name) BETWEEN 1 AND 120 AND file_size BETWEEN 1 AND 26214400)
);