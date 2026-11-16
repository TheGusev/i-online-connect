CREATE TABLE personal_chat_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  inviter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  revoked_at timestamptz
);
CREATE INDEX personal_chat_invites_owner_idx ON personal_chat_invites(inviter_id, created_at DESC);
CREATE TABLE personal_chat_invite_acceptances (
  invite_id uuid NOT NULL REFERENCES personal_chat_invites(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(invite_id, invitee_id)
);
CREATE INDEX personal_chat_invite_conversation_idx ON personal_chat_invite_acceptances(conversation_id);
