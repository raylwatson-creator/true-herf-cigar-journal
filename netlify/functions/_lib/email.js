// Set RESEND_API_KEY in Netlify's environment variables. RESET_FROM_EMAIL is
// optional -- defaults below, but should be an address on your verified
// Resend domain (e.g. noreply@trueherfjournal.com) once that's set up.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESET_FROM_EMAIL || "True Herf Cigar Journal <noreply@trueherfjournal.com>";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@trueherfjournal.com";

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

// --- Access email (sent right after a successful $2.99 purchase) ---------
// This is the email a buyer gets immediately after paying: a "thank you",
// confirmation the journal is unlocked, a direct link into account setup,
// and an order summary as a receipt. Wording matches the mockup Ray
// approved (true-herf-access-email-mockup.html) exactly.
//
// This is plain, table-based, inline-styled HTML on purpose -- most email
// clients (Outlook desktop especially) don't support the flexbox/grid/
// custom-font setup the app and the mockups use, so this trades some visual
// fidelity for actually rendering correctly everywhere. Georgia stands in
// for Fraunces, Arial/Helvetica for Source Sans 3, and Courier New for
// JetBrains Mono, keeping the same navy/gold/cream/copper palette.

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// orderNumber, amount, and date are expected pre-formatted (e.g. "#TH-10482",
// "$2.99", "Aug 29, 2026") -- format them before calling this, not here.
export function accessEmailHtml({ accessLink, orderNumber, amount, date }) {
  const link = escapeHtml(accessLink);
  const order = escapeHtml(orderNumber);
  const amt = escapeHtml(amount);
  const dt = escapeHtml(date);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Your True Herf journal is unlocked</title>
<!--[if mso]>
<noscript>
  <xml>
    <o:OfficeDocumentSettings>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
</noscript>
<![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#06091A;">
  <!-- Preheader (hidden preview text shown next to the subject in most inboxes) -->
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">
    Your journal is unlocked. Tap your access link to set up your account.
    &#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#06091A;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

          <!-- Logo / wordmark -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="width:46px; height:46px; border-radius:23px; background-color:#C9A227; font-family:Georgia,'Times New Roman',serif; font-weight:bold; font-size:15px; color:#2a1f04;">TH</td>
                </tr>
              </table>
              <div style="margin-top:10px; font-family:Georgia,'Times New Roman',serif; font-weight:bold; font-size:16px; color:#F3E9D8;">True Herf</div>
              <div style="font-family:Arial,Helvetica,sans-serif; font-size:9.5px; letter-spacing:2px; text-transform:uppercase; color:#8D91A8; margin-top:2px;">Cigar Journal</div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#131B46; border:1px solid #283268; border-radius:16px; padding:34px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="font-family:Georgia,'Times New Roman',serif; font-size:22px; line-height:1.3; color:#F3E9D8; padding-bottom:14px;">
                    Thank you for joining True Herf
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:Arial,Helvetica,sans-serif; font-size:14.5px; line-height:1.65; color:#8D91A8; padding-bottom:26px;">
                    Your journal is unlocked. Tap the button below, it drops you straight into the account setup area.
                  </td>
                </tr>

                <!-- Bulletproof CTA button -->
                <tr>
                  <td align="center" style="padding-bottom:18px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${link}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="24%" strokecolor="#8A4F24" fillcolor="#B5652F">
                    <w:anchorlock/>
                    <center style="color:#FFF2E2;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">Unlock My Journal</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${link}" target="_blank" style="display:inline-block; background-color:#B5652F; color:#FFF2E2; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; text-decoration:none; padding:15px 34px; border-radius:12px;">Unlock My Journal</a>
                    <!--<![endif]-->
                  </td>
                </tr>

                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto 26px;background:#131B46;border:1px solid #283268;border-radius:10px;">
                      <tr>
                        <td style="padding:18px 20px;">
                          <div style="font-family:Georgia,serif;color:#E4C556;font-size:14.5px;font-weight:600;margin:0 0 12px;text-align:left;">One more thing: install it</div>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width:62px;vertical-align:top;padding-bottom:10px;font-family:'Courier New',monospace;font-size:11px;color:#C9A227;">IPHONE</td>
                              <td style="vertical-align:top;padding-bottom:10px;font-family:Arial,sans-serif;font-size:13px;color:#E8DBC3;line-height:1.55;">In Safari, tap the <strong style="color:#F3E9D8;">Share</strong> icon, then <strong style="color:#F3E9D8;">Add to Home Screen</strong>.</td>
                            </tr>
                            <tr>
                              <td style="width:62px;vertical-align:top;padding-bottom:10px;font-family:'Courier New',monospace;font-size:11px;color:#C9A227;">ANDROID</td>
                              <td style="vertical-align:top;padding-bottom:10px;font-family:Arial,sans-serif;font-size:13px;color:#E8DBC3;line-height:1.55;">In Chrome, tap the <strong style="color:#F3E9D8;">menu (&#8942;)</strong>, then <strong style="color:#F3E9D8;">Add to Home screen</strong>.</td>
                            </tr>
                            <tr>
                              <td style="width:62px;"></td>
                              <td style="font-family:Arial,sans-serif;font-size:13px;color:#E8DBC3;line-height:1.55;">No app store needed, and you can always do this later from inside the app.</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="font-family:Arial,Helvetica,sans-serif; font-size:11.5px; color:#696C80; padding-bottom:8px;">
                    Or copy and paste this link into your browser:
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:#0D1230; border:1px solid #283268; border-radius:9px;">
                      <tr>
                        <td style="padding:9px 14px; font-family:'Courier New',Courier,monospace; font-size:11.5px; color:#E8DBC3; word-break:break-all;">
                          <a href="${link}" target="_blank" style="color:#E8DBC3; text-decoration:none;">${link}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="border-top:1px solid #283268; padding-top:22px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0D1230; border:1px solid #283268; border-radius:12px;">
                      <tr>
                        <td style="padding:16px 18px; font-family:Arial,Helvetica,sans-serif; font-size:12.5px; color:#8D91A8;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="padding:4px 0; font-family:Arial,Helvetica,sans-serif; font-size:12.5px; color:#8D91A8;">Product</td>
                              <td align="right" style="padding:4px 0; font-family:'Courier New',Courier,monospace; font-size:12px; color:#E8DBC3;">True Herf Cigar Journal, Full Access</td>
                            </tr>
                            <tr>
                              <td style="padding:4px 0; font-family:Arial,Helvetica,sans-serif; font-size:12.5px; color:#8D91A8;">Order</td>
                              <td align="right" style="padding:4px 0; font-family:'Courier New',Courier,monospace; font-size:12px; color:#E8DBC3;">${order}</td>
                            </tr>
                            <tr>
                              <td style="padding:4px 0; font-family:Arial,Helvetica,sans-serif; font-size:12.5px; color:#8D91A8;">Date</td>
                              <td align="right" style="padding:4px 0; font-family:'Courier New',Courier,monospace; font-size:12px; color:#E8DBC3;">${dt}</td>
                            </tr>
                            <tr>
                              <td style="border-top:1px solid #283268; padding-top:10px; font-family:Arial,Helvetica,sans-serif; font-size:12.5px; font-weight:bold; color:#E8DBC3;">Amount paid</td>
                              <td align="right" style="border-top:1px solid #283268; padding-top:10px; font-family:'Courier New',Courier,monospace; font-size:12.5px; font-weight:bold; color:#E8DBC3;">${amt}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:26px; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.7; color:#696C80;">
              This link is unique to you and only needs to be used once, to set up your account. After that, just log in with your email and PIN.<br>
              Didn't make this purchase? You can ignore this email, or reach us at
              <a href="mailto:${SUPPORT_EMAIL}" style="color:#C9A227; text-decoration:none;">${SUPPORT_EMAIL}</a>.<br>
              &copy; True Herf Cigar Journal
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendAccessEmail(to, { accessLink, orderNumber, amount, date }) {
  const html = accessEmailHtml({ accessLink, orderNumber, amount, date });
  return sendEmail(to, "Your True Herf journal is unlocked", html);
}
