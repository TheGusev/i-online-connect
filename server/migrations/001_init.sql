-- ─────────────────────────────────────────────────────────────────────────────
-- «Я Онлайн» — начальная схема PostgreSQL.
-- Соответствует моделям данных фронтенда (src/api/types.ts).
--
-- Применяется командой:  npm run migrate   (server/scripts/migrate.mjs)
-- Идемпотентна: повторный запуск ничего не ломает.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- регистронезависимый email

-- ── Перечисления ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE trust_level        AS ENUM ('new', 'verified', 'trusted', 'ambassador');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE profile_intent     AS ENUM ('serious', 'friends', 'projects', 'unsure');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_kind         AS ENUM ('photo', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verification_status AS ENUM ('none', 'pending', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reaction_kind      AS ENUM ('like', 'skip', 'save');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_kind       AS ENUM ('text', 'meeting');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE meeting_kind       AS ENUM ('coffee', 'walk', 'event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE space_category     AS ENUM ('sport', 'games', 'professional', 'culture', 'food', 'city');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE space_format       AS ENUM ('offline', 'online', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE space_cadence      AS ENUM ('weekly', 'biweekly', 'monthly', 'occasional');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE space_join_policy  AS ENUM ('open', 'question');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE member_status      AS ENUM ('member', 'pending', 'host');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_category    AS ENUM ('fake', 'behavior', 'scam', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_source      AS ENUM ('chat', 'profile');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_state       AS ENUM ('new', 'in_review', 'resolved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE location_privacy   AS ENUM ('nobody', 'matches', 'everyone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_privacy    AS ENUM ('everyone', 'verified', 'matches');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plan_id            AS ENUM ('basic', 'premium');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delete_reason      AS ENUM ('found-someone', 'too-few-matches', 'privacy', 'break', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Аккаунты и аутентификация ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext UNIQUE NOT NULL,
  phone           text,
  -- Хеш argon2id. Сам пароль в БД не попадает никогда.
  password_hash   text NOT NULL,
  email_verified  boolean NOT NULL DEFAULT false,
  phone_verified  boolean NOT NULL DEFAULT false,
  language        text NOT NULL DEFAULT 'ru',
  -- Мягкое удаление: аккаунт можно восстановить в течение restore-периода.
  deleted_at      timestamptz,
  -- Пауза профиля (не участвует в подборках, не получает сообщения).
  paused_at       timestamptz,
  last_seen_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_active_idx ON users (id) WHERE deleted_at IS NULL;

-- Refresh-токены: храним только хеш, чтобы утечка БД не давала доступ.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  user_agent  text,
  ip          inet,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- Ограничение попыток входа (дополнительно к rate limit в приложении).
CREATE TABLE IF NOT EXISTS login_attempts (
  id          bigserial PRIMARY KEY,
  email       citext,
  ip          inet,
  success     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_attempts_recent_idx ON login_attempts (email, created_at DESC);

-- ── Профили ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  user_id             uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name                text NOT NULL,
  birth_date          date,
  -- Возраст 18+ проверяется приложением; здесь дублируем инвариант.
  age                 smallint CHECK (age IS NULL OR age >= 18),
  city                text NOT NULL DEFAULT '',
  -- Точные координаты; выдача наружу зависит от privacy.exact_location.
  lat                 double precision,
  lon                 double precision,
  bio                 text NOT NULL DEFAULT '',
  intent              profile_intent NOT NULL DEFAULT 'unsure',
  intent_note         text NOT NULL DEFAULT '',
  -- Ответы из шага «ценности» онбординга.
  values_text         text NOT NULL DEFAULT '',
  joy_text            text NOT NULL DEFAULT '',
  dealbreakers_text   text NOT NULL DEFAULT '',
  trust_level         trust_level NOT NULL DEFAULT 'new',
  trust_score         smallint NOT NULL DEFAULT 0 CHECK (trust_score BETWEEN 0 AND 100),
  video_verified      boolean NOT NULL DEFAULT false,
  safe_meetings       integer NOT NULL DEFAULT 0,
  clean_conversations integer NOT NULL DEFAULT 0,
  onboarded_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_city_idx ON profiles (city);

CREATE TABLE IF NOT EXISTS profile_media (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        media_kind NOT NULL,
  url         text NOT NULL,
  position    smallint NOT NULL DEFAULT 0,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_media_user_idx ON profile_media (user_id, position);

CREATE TABLE IF NOT EXISTS interests (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug   text UNIQUE NOT NULL,
  label  text NOT NULL
);

CREATE TABLE IF NOT EXISTS user_interests (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interest_id  uuid NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, interest_id)
);

CREATE TABLE IF NOT EXISTS profile_values (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value    text NOT NULL,
  PRIMARY KEY (user_id, value)
);

-- ── Приватность, настройки, подписка ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS privacy_settings (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  exact_location   location_privacy NOT NULL DEFAULT 'matches',
  visible_in_feed  boolean NOT NULL DEFAULT true,
  who_can_message  message_privacy NOT NULL DEFAULT 'verified',
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id   uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  matches   boolean NOT NULL DEFAULT true,
  messages  boolean NOT NULL DEFAULT true,
  spaces    boolean NOT NULL DEFAULT true,
  safety    boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan        plan_id NOT NULL DEFAULT 'basic',
  since       timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  -- Идентификаторы платёжного провайдера появятся позже.
  provider    text,
  provider_id text
);

CREATE TABLE IF NOT EXISTS deletion_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        delete_reason,
  comment       text,
  restore_until timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Верификация и доверие ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS verifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          verification_status NOT NULL DEFAULT 'pending',
  -- Путь к файлу селфи в приватном хранилище; data URL в БД не храним.
  selfie_path     text NOT NULL,
  reference_url   text NOT NULL,
  reviewer_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewer_note   text,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS verifications_pending_idx ON verifications (status, submitted_at);

-- ── Подбор и дневная подборка ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS match_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction    reaction_kind NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_id),
  CHECK (user_id <> target_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Порядок пары нормализован: user_a < user_b, чтобы пара была уникальной.
  user_a      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)
);

-- Дневная подборка: 5 совпадений в день, фиксируется на сутки.
CREATE TABLE IF NOT EXISTS daily_feed (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feed_date      date NOT NULL,
  compatibility  smallint NOT NULL CHECK (compatibility BETWEEN 0 AND 100),
  -- Объяснение и подсказка первой фразы: генерируются один раз и кешируются.
  ai_explanation text NOT NULL DEFAULT '',
  first_message_hint text NOT NULL DEFAULT '',
  reasons        text[] NOT NULL DEFAULT '{}',
  position       smallint NOT NULL DEFAULT 0,
  UNIQUE (user_id, candidate_id, feed_date)
);

CREATE INDEX IF NOT EXISTS daily_feed_lookup_idx ON daily_feed (user_id, feed_date, position);

-- ── Чат ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid REFERENCES matches(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at    timestamptz,
  archived_at     timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS conversation_participants_user_idx ON conversation_participants (user_id);

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text            text NOT NULL,
  kind            message_kind NOT NULL DEFAULT 'text',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS meetings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id      uuid REFERENCES messages(id) ON DELETE SET NULL,
  proposed_by     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            meeting_kind NOT NULL,
  note            text NOT NULL DEFAULT '',
  accepted        boolean,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Сообщества (Spaces) ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS spaces (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL,
  description        text NOT NULL DEFAULT '',
  topic              text NOT NULL DEFAULT '',
  cover_url          text NOT NULL DEFAULT '',
  category           space_category NOT NULL,
  format             space_format NOT NULL DEFAULT 'offline',
  cadence            space_cadence NOT NULL DEFAULT 'monthly',
  city               text NOT NULL DEFAULT '',
  lat                double precision,
  lon                double precision,
  verified_community boolean NOT NULL DEFAULT false,
  join_policy        space_join_policy NOT NULL DEFAULT 'open',
  join_question      text,
  host_id            uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spaces_city_category_idx ON spaces (city, category);

CREATE TABLE IF NOT EXISTS space_interests (
  space_id     uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  interest_id  uuid NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
  PRIMARY KEY (space_id, interest_id)
);

CREATE TABLE IF NOT EXISTS space_members (
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      member_status NOT NULL DEFAULT 'member',
  join_answer text,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS space_members_user_idx ON space_members (user_id);

CREATE TABLE IF NOT EXISTS space_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  title       text NOT NULL,
  starts_at   timestamptz NOT NULL,
  place       text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS space_events_upcoming_idx ON space_events (space_id, starts_at);

CREATE TABLE IF NOT EXISTS event_rsvps (
  event_id   uuid NOT NULL REFERENCES space_events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  going      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS space_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id   uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS space_messages_feed_idx ON space_messages (space_id, created_at);

-- ── Безопасность: жалобы и блокировки ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     report_category NOT NULL,
  source       report_source NOT NULL,
  details      text NOT NULL DEFAULT '',
  state        report_state NOT NULL DEFAULT 'new',
  review_hours smallint NOT NULL DEFAULT 24,
  moderator_id uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_queue_idx ON reports (state, created_at);

CREATE TABLE IF NOT EXISTS blocks (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_id),
  CHECK (user_id <> blocked_id)
);

-- ── Служебное: журнал применённых миграций ───────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
