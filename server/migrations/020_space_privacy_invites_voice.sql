-- Приватные пространства, приглашения и голосовые сообщения общего чата.
ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS space_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id     uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  inviter_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (space_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS space_invites_invitee_idx
  ON space_invites (invitee_id, status, created_at DESC);

ALTER TABLE space_messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text'
    CHECK (kind IN ('text', 'voice')),
  ADD COLUMN IF NOT EXISTS client_temp_id uuid,
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

ALTER TABLE space_messages DROP CONSTRAINT IF EXISTS space_messages_voice_payload_check;
ALTER TABLE space_messages ADD CONSTRAINT space_messages_voice_payload_check CHECK (
  (kind = 'text' AND media_url IS NULL AND media_mime IS NULL AND duration_ms IS NULL)
  OR
  (kind = 'voice' AND media_url IS NOT NULL AND media_mime IS NOT NULL
    AND duration_ms BETWEEN 400 AND 180000)
);

CREATE UNIQUE INDEX IF NOT EXISTS space_messages_client_temp_uniq
  ON space_messages (space_id, author_id, client_temp_id)
  WHERE client_temp_id IS NOT NULL;