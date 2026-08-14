import { getDatabase } from "@netlify/database";
import { verifySession, getBearerToken } from "./_lib/auth.js";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

const rowToEntry = (row) => ({ id: row.id, ...row.data });

export default async (req) => {
  const session = verifySession(getBearerToken(req));
  if (!session) return json(401, { error: "Not signed in." });
  const userId = session.uid;

  const method = req.method;

  try {
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
      if (!entry) return json(400, { error: "entry required" });

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
      if (!id || !entry) return json(400, { error: "id and entry required" });

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
    return json(500, { error: String(e && e.message ? e.message : e) });
  }
};
