-- Purchases table for the $5 one-time-fee paywall. claim_token is what the
-- access-link email points to (a long random value, not the email address
-- itself, so the link can't be guessed). claimed_at stays NULL until
-- auth-signup.js consumes the purchase to create an account; a purchase can
-- only be used once.
CREATE TABLE purchases (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  order_number TEXT NOT NULL,
  claim_token TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_purchases_email ON purchases (email);
CREATE INDEX idx_purchases_claim_token ON purchases (claim_token);
