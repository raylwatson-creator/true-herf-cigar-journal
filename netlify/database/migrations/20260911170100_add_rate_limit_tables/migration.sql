-- Per-IP lockout for the admin stats password (netlify/functions/admin-stats.js).
-- Deliberately keyed by IP, not global, so one attacker hammering wrong
-- passwords can't lock Ray himself out of his own admin page.
CREATE TABLE admin_login_attempts (
  ip TEXT PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ
);

-- Per-IP rate limit for starting checkout (netlify/functions/create-payment-intent.js),
-- a public, unauthenticated endpoint that creates real Stripe PaymentIntents.
-- Rows older than a day are pruned opportunistically by the function itself;
-- this table is small and short-lived by design.
CREATE TABLE checkout_rate_limit (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkout_rate_limit_ip_created ON checkout_rate_limit (ip, created_at);
