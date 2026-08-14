import { getDatabase } from "@netlify/database";
import { verifyPin, signSession, EMAIL_RE } from "./_lib/auth.js";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

const MAX_ATTEMPTS = 5;
const LOCKED_MESSAGE = "Too many incorrect attempts. Reset your PIN to unlock this account.";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    const pin = body.pin;

    if (!EMAIL_RE.test(email) || !pin) {
      return json(400, { error: "Enter your email and PIN." });
    }

    const [user] = await db.sql`
      SELECT id, pin_hash, failed_attempts FROM users WHERE email = ${email}
    `;

    // Same generic error whether the email doesn't exist or the PIN is wrong,
    // so this endpoint can't be used to find out which emails have accounts.
    if (!user) {
      return json(401, { error: "Incorrect email or PIN." });
    }

    if (user.failed_attempts >= MAX_ATTEMPTS) {
      return json(423, { error: LOCKED_MESSAGE, locked: true });
    }

    const valid = verifyPin(pin, user.pin_hash);

    if (!valid) {
      const attempts = user.failed_attempts + 1;
      const lockedNow = attempts >= MAX_ATTEMPTS;

      await db.sql`
        UPDATE users
        SET failed_attempts = ${attempts},
            locked_until = ${lockedNow ? new Date().toISOString() : null}
        WHERE id = ${user.id}
      `;

      if (lockedNow) {
        return json(423, { error: LOCKED_MESSAGE, locked: true });
      }
      return json(401, {
        error: "Incorrect email or PIN.",
        attemptsRemaining: MAX_ATTEMPTS - attempts,
      });
    }

    // Correct PIN -- clear any prior failed attempts.
    await db.sql`
      UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ${user.id}
    `;

    const token = signSession(user.id);
    return json(200, { token, email });
  } catch (e) {
    return json(500, { error: String(e && e.message ? e.message : e) });
  }
};
