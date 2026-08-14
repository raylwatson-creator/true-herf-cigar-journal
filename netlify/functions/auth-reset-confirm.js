import { getDatabase } from "@netlify/database";
import { hashResetCode, hashPin, signSession, EMAIL_RE, PIN_RE } from "./_lib/auth.js";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

const CODE_RE = /^\d{6}$/;

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    const code = (body.code || "").trim();
    const newPin = body.newPin;

    if (!EMAIL_RE.test(email)) return json(400, { error: "Enter a valid email address." });
    if (!CODE_RE.test(code)) return json(400, { error: "Enter the 6-digit code from your email." });
    if (!PIN_RE.test(String(newPin || ""))) return json(400, { error: "New PIN must be exactly 4 digits." });

    const [user] = await db.sql`SELECT id FROM users WHERE email = ${email}`;
    // Generic error either way -- doesn't reveal whether the email exists.
    if (!user) return json(400, { error: "Invalid or expired code." });

    const codeHash = hashResetCode(code);

    const [reset] = await db.sql`
      SELECT id FROM password_resets
      WHERE user_id = ${user.id}
        AND code_hash = ${codeHash}
        AND used = FALSE
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!reset) return json(400, { error: "Invalid or expired code." });

    const pinHash = hashPin(newPin);

    await db.sql`UPDATE password_resets SET used = TRUE WHERE id = ${reset.id}`;
    await db.sql`
      UPDATE users
      SET pin_hash = ${pinHash}, failed_attempts = 0, locked_until = NULL
      WHERE id = ${user.id}
    `;

    // Log them in immediately so the reset flow also completes login.
    const token = signSession(user.id);
    return json(200, { token, email });
  } catch (e) {
    return json(500, { error: String(e && e.message ? e.message : e) });
  }
};
