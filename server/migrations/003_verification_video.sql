-- ─────────────────────────────────────────────────────────────────────────────
-- Живая видео-верификация: одноразовые задания и вердикт автосверки.
--
-- Видео и кадры лежат на диске в VERIFICATION_DIR (Nginx его не раздаёт),
-- в БД попадают только пути и результат проверки.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE verifications
  ADD COLUMN IF NOT EXISTS video_path   text,
  ADD COLUMN IF NOT EXISTS challenge    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS verdict      jsonb,
  ADD COLUMN IF NOT EXISTS confidence   smallint,
  ADD COLUMN IF NOT EXISTS reason       text NOT NULL DEFAULT '',
  -- true, если решение принял человек, а не автосверка.
  ADD COLUMN IF NOT EXISTS manual       boolean NOT NULL DEFAULT false;

-- Одноразовые задания: «поверните голову», «покажите два пальца», код словами.
CREATE TABLE IF NOT EXISTS verification_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instructions text[] NOT NULL,
  spoken_code  text NOT NULL,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_challenges_user_idx
  ON verification_challenges (user_id, expires_at DESC);
