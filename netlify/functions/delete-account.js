import { getDatabase } from "@netlify/database";
import { verifySession, getBearerToken, verifyPin, PIN_RE } from "./_lib/auth.js";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const session = verifySession(getBearerToken(req));
  if (!session) return json(401, { error: "Not signed in." });
  const userId = session.uid;

  try {
    const body = await req.json();
    const pin = body.pin;

    if (!PIN_RE.test(String(pin || ""))) {
      return json(400, { error: "Enter your 4-digit PIN." });
    }

    const [user] = await db.sql`SELECT pin_hash FROM users WHERE id = ${userId}`;
    if (!user) {
      // Account is already gone -- treat as success so the client can
      // finish logging out cleanly instead of getting stuck on an error.
      return json(200, { deleted: true });
    }

    // Re-verify the PIN even though the request already carries a valid
    // session token -- this is a destructive, irreversible action, so it
    // gets its own confirmation step rather than relying only on whoever
    // is currently holding the session token in the browser. Returned as
    // 403 (not 401) so the client's generic "session expired" handling
    // for 401s doesn't swallow this as something other than a wrong PIN.
    if (!verifyPin(pin, user.pin_hash)) {
      return json(403, { error: "Incorrect PIN." });
    }

    // Deletes the user row. entries.user_id and password_resets.user_id
    // both have ON DELETE CASCADE (see the add_users_auth migration), so
    // every journal entry and any pending PIN-reset code for this account
    // is removed automatically in the same transaction. The purchases
    // table is matched by email/claim_token, not a foreign key to users,
    // so a purchase/receipt record is intentionally left in place as a
    // payment trail even after the account itself is deleted.
    await db.sql`DELETE FROM users WHERE id = ${userId}`;

    return json(200, { deleted: true });
  } catch (e) {
    return json(500, { error: String(e && e.message ? e.message : e) });
  }
};
