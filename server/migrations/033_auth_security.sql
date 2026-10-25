-- Разделение SMS входа/привязки и одноразовые коды восстановления почты.
ALTER TABLE auth_otps ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'login';
ALTER TABLE auth_otps ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE;
CREATE TABLE IF NOT EXISTS auth_email_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip text
);
CREATE INDEX IF NOT EXISTS auth_email_codes_email_idx ON auth_email_codes (email, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_email_codes_ip_idx ON auth_email_codes (ip, created_at DESC);