// Set RESEND_API_KEY in Netlify's environment variables. RESET_FROM_EMAIL is
// optional -- defaults below, but should be an address on your verified
// Resend domain (e.g. noreply@trueherfjournal.com) once that's set up.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESET_FROM_EMAIL || "True Herf Cigar Journal <noreply@trueherfjournal.com>";

export async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Email send failed: ${res.status} ${text}`);
  }
  return res.json();
}
