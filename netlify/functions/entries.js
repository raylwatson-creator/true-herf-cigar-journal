import { getDatabase } from "@netlify/database";
import { verifySession, getBearerToken, sessionVersionMatches } from "./_lib/auth.js";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

const rowToEntry = (row) => ({ id: row.id, ...row.data });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Basic shape/size guard -- an account can only ever affect its own rows
// (every query below is scoped to user_id), so this is hygiene against
// accidental storage bloat or a malformed client payload, not a
// cross-user risk.
const MAX_ENTRY_BYTES = 2_000_000; // 2MB, comfortably above a real entry with a compressed photo
function entryProblem(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "entry required";
  if (JSON.stringify(entry).length > MAX_ENTRY_BYTES) return "entry is too large";
  // Strength and Body are optional five-step scales: null/absent, or a whole number 0 to 4.
  for (const key of ["strength", "body"]) {
    const v = entry[key];
    if (v !== undefined && v !== null && !(Number.isInteger(v) && v >= 0 && v <= 4)) {
      return `${key} must be a whole number from 0 to 4`;
    }
  }
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
      const params = new URL(req.url).searchParams;

      // GET ?photo=<entry id> -> just that entry's photo. The journal list is
      // fetched WITHOUT photos (below) so the text shows up right away, then the
      // app pulls each photo separately and fades it in as it arrives.
      const photoId = params.get("photo");
      if (photoId) {
        if (!UUID_RE.test(photoId)) return json(400, { error: "invalid id" });
        const [row] = await db.sql`
          SELECT data->>'photo' AS photo FROM entries
          WHERE id = ${photoId} AND user_id = ${userId}
        `;
        if (!row) return json(404, { error: "not found" });
        return json(200, { id: photoId, photo: row.photo || null });
      }

      // GET ?page=<n>&pageSize=<n>[&q=<search text>] -> one page of the journal
      // list, photos left out (each entry carries hasPhoto instead), plus the
      // total count so the app can draw numbered pages. Search runs here on the
      // server so it covers every entry, not just the page on screen.
      if (params.has("page")) {
        const pageSize = Math.min(Math.max(parseInt(params.get("pageSize"), 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
        const q = (params.get("q") || "").trim().toLowerCase().slice(0, 100);
        const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;

        const [{ n }] = q
          ? await db.sql`
              SELECT COUNT(*)::int AS n FROM entries
              WHERE user_id = ${userId} AND lower(concat_ws(' ', data->>'brand', data->>'name', data->>'vitola', data->>'wrapper', data->>'binder', data->>'filler', data->>'pairing', data#>>'{thirds,first}', data#>>'{thirds,second}', data#>>'{thirds,final}', data#>>'{thirdsFlavors,first}', data#>>'{thirdsFlavors,second}', data#>>'{thirdsFlavors,final}')) LIKE ${pattern}
            `
          : await db.sql`
              SELECT COUNT(*)::int AS n FROM entries WHERE user_id = ${userId}
            `;
        const pages = Math.max(1, Math.ceil(n / pageSize));
        const page = Math.min(Math.max(parseInt(params.get("page"), 10) || 1, 1), pages);
        const offset = (page - 1) * pageSize;

        const rows = q
          ? await db.sql`
              SELECT id, data - 'photo' AS data, (data->>'photo') IS NOT NULL AS has_photo
              FROM entries
              WHERE user_id = ${userId} AND lower(concat_ws(' ', data->>'brand', data->>'name', data->>'vitola', data->>'wrapper', data->>'binder', data->>'filler', data->>'pairing', data#>>'{thirds,first}', data#>>'{thirds,second}', data#>>'{thirds,final}', data#>>'{thirdsFlavors,first}', data#>>'{thirdsFlavors,second}', data#>>'{thirdsFlavors,final}')) LIKE ${pattern}
              ORDER BY created_at DESC
              LIMIT ${pageSize} OFFSET ${offset}
            `
          : await db.sql`
              SELECT id, data - 'photo' AS data, (data->>'photo') IS NOT NULL AS has_photo
              FROM entries
              WHERE user_id = ${userId}
              ORDER BY created_at DESC
              LIMIT ${pageSize} OFFSET ${offset}
            `;
        return json(200, {
          entries: rows.map((r) => ({ id: r.id, ...r.data, hasPhoto: r.has_photo })),
          total: n,
          page,
          pages,
          pageSize,
        });
      }

      // GET with no params -> every entry, photos included. Kept exactly as it
      // was; the Stats tab (totals, flavor chart, Cigar Calendar) needs all of
      // them and only loads this when that tab is opened.
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
