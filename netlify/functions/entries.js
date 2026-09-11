import { getDatabase } from "@netlify/database";
import { verifySession, getBearerToken, sessionVersionMatches } from "./_lib/auth.js";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

const rowToEntry = (row) => ({ id: row.id, ...row.data });

// Basic shape/size guard -- an account can only ever affect its own rows
// (every query below is scoped to user_id), so this is hygiene against
// accidental storage bloat or a malformed client payload, not a
// cross-user risk.
const MAX_ENTRY_BYTES = 2_000_000; // 2MB, comfortably above a real entry with a compressed photo
function entryProblem(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "entry required";
  if (JSON.stringify(entry).length > MAX_ENTRY_BYTES) return "entry is too large";
  return null;
}

export default async (req) => {
  const session = verifySession(getBearerToken(req));
  if (!session) return json(401, { error: "Not signed in." });
  const userId = session.uid;

  const method = req.method;

  try {
    // Catches a token that's been revoked since it was issued (a PIN
    // reset bumps session_version -- see auth-reset-confirm.js) even
    // though its signature still checks out.
    if (!(await sessionVersionMatches(db, session))) {
      return json(401, { error: "Not signed in." });
    }

    if (method === "GET") {
      const rows = await db.sql`
        SELECT id, data FROM entries
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;
      return json(200, rows.map(rowToEntry));
    }

    if (method === "POST") {
      const body = await req.json();
      const { entry } = body;
      const problem = entryProblem(entry);
      if (problem) return json(400, { error: problem });

      const [row] = await db.sql`
        INSERT INTO entries (user_id, data)
        VALUES (${userId}, ${JSON.stringify(entry)}::jsonb)
        RETURNING id, data
      `;
      return json(201, rowToEntry(row));
    }

    if (method === "PUT") {
      const body = await req.json();
      const { id, entry } = body;
      if (!id) return json(400, { error: "id and entry required" });
      const problem = entryProblem(entry);
      if (problem) return json(400, { error: problem });

      const [row] = await db.sql`
        UPDATE entries
        SET data = ${JSON.stringify(entry)}::jsonb, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, data
      `;
      if (!row) return json(404, { error: "not found" });
      return json(200, rowToEntry(row));
    }

    if (method === "DELETE") {
      const body = await req.json();
      const { id } = body;
      if (!id) return json(400, { error: "id required" });

      await db.sql`
        DELETE FROM entries WHERE id = ${id} AND user_id = ${userId}
      `;
      return json(200, { deleted: true });
    }

    return json(405, { error: "method not allowed" });
  } catch (e) {
    console.error("entries error:", e);
    return json(500, { error: "Something went wrong. Please try again." });
  }
};
