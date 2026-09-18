-- Speeds up the paged Journal list (WHERE user_id = ... ORDER BY created_at DESC LIMIT/OFFSET).
CREATE INDEX IF NOT EXISTS idx_entries_user_created ON entries(user_id, created_at DESC);
