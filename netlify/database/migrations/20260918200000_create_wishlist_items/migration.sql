-- Wish list: cigars a person wants to try. One row per cigar, small jsonb payload
-- (brand, name, vitola, note). Removed automatically when the account is deleted.
CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_user_created ON wishlist_items(user_id, created_at DESC);
