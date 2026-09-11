import crypto from "node:crypto";
import { getDatabase } from "@netlify/database";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

// Hashing both sides to a fixed-length digest before comparing means
// crypto.timingSafeEqual can be used even though the submitted password and
// the real one aren't the same length -- timingSafeEqual requires equal-
// length buffers, and comparing raw strings with !== leaks timing
// information proportional to how many leading characters match.
function passwordsMatch(a, b) {
  const ah = crypto.createHash("sha256").update(String(a)).digest();
  const bh = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ah, bh);
}

const MAX_ADMIN_ATTEMPTS = 5;
const ADMIN_LOCKOUT_MINUTES = 15;

function getClientIp(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

// Internal-only stats endpoint for the standalone admin page
// (public/admin-5fc044b0acc883e3.html).
// Not linked from anywhere in the customer-facing app. Gated by a shared
// secret set as the ADMIN_PASSWORD environment variable in Netlify -- if that
// variable isn't set at all, this refuses every request rather than being
// silently open.
export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "method not allowed" });

  const providedPassword = req.headers.get("x-admin-password") || "";
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  const ip = getClientIp(req);

  try {
    // Locked out by IP, not globally -- so someone hammering wrong
    // passwords from elsewhere can't lock Ray out of his own admin page.
    const [attemptRow] = await db.sql`
      SELECT attempts, locked_until FROM admin_login_attempts WHERE ip = ${ip}
    `;
    if (attemptRow?.locked_until && new Date(attemptRow.locked_until) > new Date()) {
      return json(429, { error: "Too many attempts. Try again in a few minutes." });
    }

    if (!adminPassword || !passwordsMatch(providedPassword, adminPassword)) {
      const attempts = (attemptRow?.attempts || 0) + 1;
      const lockedNow = attempts >= MAX_ADMIN_ATTEMPTS;
      const lockedUntil = lockedNow
        ? new Date(Date.now() + ADMIN_LOCKOUT_MINUTES * 60 * 1000).toISOString()
        : null;
      await db.sql`
        INSERT INTO admin_login_attempts (ip, attempts, locked_until)
        VALUES (${ip}, ${attempts}, ${lockedUntil})
        ON CONFLICT (ip) DO UPDATE
          SET attempts = ${attempts}, locked_until = ${lockedUntil}
      `;
      return json(401, { error: "Unauthorized" });
    }

    // Correct password -- clear this IP's attempt count.
    await db.sql`DELETE FROM admin_login_attempts WHERE ip = ${ip}`;

    // Bare-minimum audit trail: there's a single shared password and no
    // per-user identity, so this is the only record of who (by IP) opened
    // the dashboard and when. Not surfaced in the UI, just there to check
    // later if it's ever needed. Pruned opportunistically (same pattern as
    // checkout_rate_limit) so it doesn't grow forever.
    await db.sql`INSERT INTO admin_access_log (ip) VALUES (${ip})`;
    await db.sql`DELETE FROM admin_access_log WHERE created_at < NOW() - INTERVAL '90 days'`;
  } catch (e) {
    console.error("admin-stats auth check error:", e);
    return json(500, { error: "Something went wrong. Please try again." });
  }

  try {
    const [{ count: totalUsers }] = await db.sql`
      SELECT COUNT(*)::int AS count FROM users
    `;
    const [{ count: totalPurchases }] = await db.sql`
      SELECT COUNT(*)::int AS count FROM purchases
    `;
    const [{ count: unclaimedPurchases }] = await db.sql`
      SELECT COUNT(*)::int AS count FROM purchases WHERE claimed_at IS NULL
    `;
    const [{ total: revenueCents }] = await db.sql`
      SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total FROM purchases
    `;
    // "Active" has no login-tracking to go on yet (sessions are stateless,
    // signed tokens -- see auth.js), so this proxies activity off actual
    // journal usage instead: anyone who has logged at least one entry in the
    // last 30 days.
    const [{ count: activeUsers30d }] = await db.sql`
      SELECT COUNT(DISTINCT user_id)::int AS count
      FROM entries
      WHERE user_id IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days'
    `;
    const recentSignups = await db.sql`
      SELECT email, created_at FROM users ORDER BY created_at DESC LIMIT 25
    `;
    const unclaimed = await db.sql`
      SELECT email, order_number, created_at FROM purchases
      WHERE claimed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 25
    `;

    return json(200, {
      totalUsers,
      totalPurchases,
      unclaimedPurchases,
      revenueCents: Number(revenueCents),
      activeUsers30d,
      recentSignups,
      unclaimedPurchasesList: unclaimed,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("admin-stats error:", e);
    return json(500, { error: "Something went wrong. Please try again." });
  }
};
