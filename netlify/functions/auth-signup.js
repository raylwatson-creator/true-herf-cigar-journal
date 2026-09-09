import { getDatabase } from "@netlify/database";
import { hashPin, signSession, EMAIL_RE, PIN_RE } from "./_lib/auth.js";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    const pin = body.pin;
    const deviceId = body.deviceId || null;

    if (!EMAIL_RE.test(email)) {
      return json(400, { error: "Enter a valid email address." });
    }
    if (!PIN_RE.test(String(pin || ""))) {
      return json(400, { error: "PIN must be exactly 4 digits." });
    }

    const [existing] = await db.sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing) {
      return json(409, { error: "An account with this email already exists." });
    }

    // Paywall gate: this email needs a completed, not-yet-used purchase on
    // file before an account can be created. This is the one and only place
    // the purchase requirement is enforced -- it's a database lookup, not a
    // client-side check, so there's no way to reach this by skipping the
    // marketing/checkout page. Logging in (auth-login.js) is untouched and
    // has no purchase check, so this only affects brand new accounts.
    const [purchase] = await db.sql`
      SELECT id FROM purchases
      WHERE email = ${email} AND claimed_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `;
    if (!purchase) {
      return json(402, {
        error: "We don't see a completed purchase for this email yet. Please buy access first, then create your account.",
      });
    }

    const pinHash = hashPin(pin);

    const [user] = await db.sql`
      INSERT INTO users (email, pin_hash)
      VALUES (${email}, ${pinHash})
      RETURNING id
    `;

    await db.sql`UPDATE purchases SET claimed_at = NOW() WHERE id = ${purchase.id}`;

    // Claim this device's existing (previously device-scoped) entries, if any.
    if (deviceId) {
      await db.sql`
        UPDATE entries SET user_id = ${user.id}
        WHERE device_id = ${deviceId} AND user_id IS NULL
      `;
    }

    const token = signSession(user.id);
    return json(201, { token, email });
  } catch (e) {
    return json(500, { error: String(e && e.message ? e.message : e) });
  }
};
