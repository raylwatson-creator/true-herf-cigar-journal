-- Users: one row per account. PIN is never stored in plain text.
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- Password (PIN) resets: short-lived, single-use codes emailed to the user.
CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_password_resets_user_id ON password_resets(user_id);

-- Link entries to a user account. device_id is kept (nullable going forward)
-- so existing device-scoped entries can be claimed by a new account on signup;
-- it can be dropped in a later migration once that transition is complete.
ALTER TABLE entries ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE entries ALTER COLUMN device_id DROP NOT NULL;

CREATE INDEX idx_entries_user_id ON entries(user_id);
