import { getDatabase } from "@netlify/database";
import { hashResetCode, generateResetCode, EMAIL_RE } from "./_lib/auth.js";
import { sendEmail } from "./_lib/email.js";

const db = getDatabase();

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

const RATE_LIMIT_MS = 2 * 60 * 1000; // one request per email per 2 minutes
const EXPIRY_MINUTES = 15;

// Same response every time -- whether the email doesn't exist, was just
// rate-limited, or a code was actually sent -- so this can't be used to
// find out which emails have accounts, or to spam an inbox.
const GENERIC_OK = { message: "If that email has an account, a reset code has been sent." };

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  try {
    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json(400, { error: "Enter a valid email address." });

    const [user] = await db.sql`SELECT id FROM users WHERE email = ${email}`;
    if (!user) return json(200, GENERIC_OK);

    const [recent] = await db.sql`
      SELECT created_at FROM password_resets
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (recent && Date.now() - new Date(recent.created_at).getTime() < RATE_LIMIT_MS) {
      return json(200, GENERIC_OK);
    }

    const code = generateResetCode();
    const codeHash = hashResetCode(code);
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString();

    await db.sql`
      INSERT INTO password_resets (user_id, code_hash, expires_at)
      VALUES (${user.id}, ${codeHash}, ${expiresAt})
    `;

    await sendEmail(
      email,
      "Your True Herf reset code",
      `<div style="font-family: Georgia, serif; background:#0a0f2e; padding:32px; color:#f3e9d8;">
         <h2 style="color:#c9a227; margin:0 0 4px;">True Herf Cigar Journal</h2>
         <p>Use this code to reset your PIN. It expires in ${EXPIRY_MINUTES} minutes.</p>
         <div style="font-size:32px; letter-spacing:8px; font-weight:bold; color:#f3e9d8; margin:24px 0;">${code}</div>
         <p style="color:#a6a9bd; font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
       </div>`
    );

    return json(200, GENERIC_OK);
  } catch (e) {
    return json(500, { error: String(e && e.message ? e.message : e) });
  }
};
