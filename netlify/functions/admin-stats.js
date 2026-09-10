import { getDatabase } from "@netlify/database";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

// Internal-only stats endpoint for the standalone admin page (public/admin.html).
// Not linked from anywhere in the customer-facing app. Gated by a shared
// secret set as the ADMIN_PASSWORD environment variable in Netlify -- if that
// variable isn't set at all, this refuses every request rather than being
// silently open.
export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "method not allowed" });

  const providedPassword = req.headers.get("x-admin-password") || "";
  const adminPassword = process.env.ADMIN_PASSWORD || "";

  if (!adminPassword || providedPassword !== adminPassword) {
    return json(401, { error: "Unauthorized" });
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
    return json(500, { error: String(e && e.message ? e.message : e) });
  }
};
