ALTER TABLE conversations
  ADD COLUMN notes_owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN notes_title text,
  ADD COLUMN notes_request_id uuid;

ALTER TABLE conversations ADD CONSTRAINT conversation_notes_shape CHECK (
  (
    notes_owner_id IS NULL
    AND notes_title IS NULL
    AND notes_request_id IS NULL
  )
  OR
  (
    notes_owner_id IS NOT NULL
    AND notes_title IS NOT NULL
    AND notes_request_id IS NOT NULL
    AND match_id IS NULL
    AND length(trim(notes_title)) BETWEEN 1 AND 80
  )
);

CREATE UNIQUE INDEX conversation_notes_request_unique
  ON conversations(notes_owner_id, notes_request_id)
  WHERE notes_owner_id IS NOT NULL;

CREATE FUNCTION guard_note_chat_owner_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.notes_owner_id IS DISTINCT FROM OLD.notes_owner_id THEN
    RAISE EXCEPTION 'Note chat ownership and conversation type are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER note_chat_owner_immutable
BEFORE UPDATE OF notes_owner_id ON conversations
FOR EACH ROW EXECUTE FUNCTION guard_note_chat_owner_immutable();

CREATE FUNCTION guard_note_chat_participant()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  owner_id uuid;
BEGIN
  SELECT notes_owner_id INTO owner_id
    FROM conversations WHERE id = NEW.conversation_id;
  IF owner_id IS NOT NULL AND NEW.user_id <> owner_id THEN
    RAISE EXCEPTION 'A note chat is accessible only to its owner';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER note_chat_participant_guard
BEFORE INSERT OR UPDATE ON conversation_participants
FOR EACH ROW EXECUTE FUNCTION guard_note_chat_participant();
