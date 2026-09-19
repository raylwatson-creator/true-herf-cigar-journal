import { getDatabase } from "@netlify/database";
import { verifySession, getBearerToken, sessionVersionMatches } from "./_lib/auth.js";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 200;

// A wish-list item is small and fixed in shape, so only these text fields are ever stored
// (anything else in the request is dropped) and each one is length-limited.
const FIELDS = { brand: 100, name: 100, vitola: 60, note: 300 };

function cleanItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const out = {};
  for (const [key, max] of Object.entries(FIELDS)) {
    const v = item[key];
    if (v !== undefined && v !== null && typeof v !== "string") return null;
    out[key] = (v || "").trim().slice(0, max);
  }
  if (!out.brand) return null;
  return out;
}

export default async (req) => {
  const session = verifySession(getBearerToken(req));
  if (!session) return json(401, { error: "Not signed in." });
  const userId = session.uid;

  try {
    // Same revoked-token check the entries function makes.
    if (!(await sessionVersionMatches(db, session))) {
      return json(401, { error: "Not signed in." });
    }

    if (req.method === "GET") {
      const rows = await db.sql`
        SELECT id, data FROM wishlist_items
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;
      return json(200, rows.map((r) => ({ id: r.id, ...r.data })));
    }

    if (req.method === "POST") {
      const body = await req.json();
      const item = cleanItem(body && body.item);
      if (!item) return json(400, { error: "A brand is required." });

      const [{ n }] = await db.sql`SELECT COUNT(*)::int AS n FROM wishlist_items WHERE user_id = ${userId}`;
      if (n >= MAX_ITEMS) {
        return json(400, { error: `Your wish list is full (${MAX_ITEMS} cigars). Remove one to add another.` });
      }

      const [row] = await db.sql`
        INSERT INTO wishlist_items (user_id, data)
        VALUES (${userId}, ${JSON.stringify(item)}::jsonb)
        RETURNING id, data
      `;
      return json(201, { id: row.id, ...row.data });
    }

    if (req.method === "DELETE") {
      const body = await req.json();
      const id = body && body.id;
      if (!id || !UUID_RE.test(id)) return json(400, { error: "id required" });
      await db.sql`DELETE FROM wishlist_items WHERE id = ${id} AND user_id = ${userId}`;
      return json(200, { deleted: true });
    }

    return json(405, { error: "method not allowed" });
  } catch (e) {
    console.error("wishlist error:", e);
    return json(500, { error: "Something went wrong. Please try again." });
  }
};
