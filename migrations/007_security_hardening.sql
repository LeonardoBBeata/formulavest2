-- Existing verification codes have no expiry and therefore become invalid.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS codigo_verificacao_expira TIMESTAMP;

-- Refresh tokens issued before this migration were stored in plaintext and are
-- intentionally no longer accepted by the application, which now compares a
-- SHA-256 hash. No destructive cleanup is needed because this migration runner
-- may execute files more than once.
