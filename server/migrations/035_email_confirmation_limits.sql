-- Persist per-IP email confirmation limits across processes and restarts.
ALTER TABLE contact_confirmations ADD COLUMN IF NOT EXISTS ip text;
CREATE INDEX IF NOT EXISTS contact_confirmations_ip_created_idx
  ON contact_confirmations (ip, created_at DESC);