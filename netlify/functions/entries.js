import { getDatabase } from "@netlify/database";

const db = getDatabase();

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const rowToEntry = (row) => ({ id: row.id, ...row.data });

export default async (req) => {
  const url = new URL(req.url);
  const method = req.method;

  try {
    if (method === "GET") {
      const deviceId = url.searchParams.get("deviceId");
      if (!deviceId) return json(400, { error: "deviceId required" });

      const rows = await db.sql`
        SELECT id, data FROM entries
        WHERE device_id = ${deviceId}
        ORDER BY created_at DESC
      `;
      return json(200, rows.map(rowToEntry));
    }

    if (method === "POST") {
      const body = await req.json();
      const { deviceId, entry } = body;
      if (!deviceId || !entry) return json(400, { error: "deviceId and entry required" });

      const [row] = await db.sql`
        INSERT INTO entries (device_id, data)
        VALUES (${deviceId}, ${JSON.stringify(entry)}::jsonb)
        RETURNING id, data
      `;
      return json(201, rowToEntry(row));
    }

    if (method === "PUT") {
      const body = await req.json();
      const { deviceId, id, entry } = body;
      if (!deviceId || !id || !entry) return json(400, { error: "deviceId, id and entry required" });

      const [row] = await db.sql`
        UPDATE entries
        SET data = ${JSON.stringify(entry)}::jsonb, updated_at = NOW()
        WHERE id = ${id} AND device_id = ${deviceId}
        RETURNING id, data
      `;
      if (!row) return json(404, { error: "not found" });
      return json(200, rowToEntry(row));
    }

    if (method === "DELETE") {
      const body = await req.json();
      const { deviceId, id } = body;
      if (!deviceId || !id) return json(400, { error: "deviceId and id required" });

      await db.sql`
        DELETE FROM entries WHERE id = ${id} AND device_id = ${deviceId}
      `;
      return json(200, { deleted: true });
    }

    return json(405, { error: "method not allowed" });
  } catch (e) {
    return json(500, { error: String(e && e.message ? e.message : e) });
  }
};
