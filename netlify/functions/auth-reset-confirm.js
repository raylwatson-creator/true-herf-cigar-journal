import { getDatabase } from "@netlify/database";
import { hashResetCode, hashPin, signSession, EMAIL_RE, PIN_RE } from "./_lib/auth.js";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

const CODE_RE = /^\d{6}$/;

// A 6-digit code has about 900,000 possible values -- plenty against a
// single blind guess, but not against unlimited guesses within its
// 15-minute window. This caps wrong guesses against any one outstanding
// code the same way MAX_ATTEMPTS already caps wrong PINs on login.
const MAX_RESET_ATTEMPTS = 5;

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

    // Look up the currently-outstanding code for this user first, regardless
    // of what was submitted, so wrong guesses can be counted against it.
    // Without this, a guess that doesn't match anything just falls through
    // with nothing recording how many times it's been tried.
    const [active] = await db.sql`
      SELECT id, code_hash, attempts FROM password_resets
      WHERE user_id = ${user.id}
        AND used = FALSE
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!active) return json(400, { error: "Invalid or expired code." });

    if (active.attempts >= MAX_RESET_ATTEMPTS) {
      // Burn the code so a fresh one is required -- same generic message,
      // so a guesser can't tell "wrong guess" apart from "locked out."
      await db.sql`UPDATE password_resets SET used = TRUE WHERE id = ${active.id}`;
      return json(400, { error: "Invalid or expired code." });
    }

    const codeHash = hashResetCode(code);
    if (codeHash !== active.code_hash) {
      await db.sql`UPDATE password_resets SET attempts = attempts + 1 WHERE id = ${active.id}`;
      return json(400, { error: "Invalid or expired code." });
    }

    const pinHash = hashPin(newPin);

    await db.sql`UPDATE password_resets SET used = TRUE WHERE id = ${active.id}`;
    // Bumping session_version here, not just changing the PIN, is what
    // actually invalidates every other session token issued before this
    // reset -- someone who reset a PIN because a device with a live
    // session was lost or stolen needs that old session cut off, not just
    // the PIN changed underneath it. See sessionVersionMatches() in
    // _lib/auth.js for the other half of this.
    const [updated] = await db.sql`
      UPDATE users
      SET pin_hash = ${pinHash}, failed_attempts = 0, locked_until = NULL,
          session_version = session_version + 1
      WHERE id = ${user.id}
      RETURNING session_version
    `;

    // Log them in immediately so the reset flow also completes login.
    const token = signSession(user.id, updated.session_version);
    return json(200, { token, email });
  } catch (e) {
    console.error("auth-reset-confirm error:", e);
    return json(500, { error: "Something went wrong. Please try again." });
  }
};
