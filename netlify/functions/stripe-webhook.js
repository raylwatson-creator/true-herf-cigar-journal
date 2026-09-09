// Stripe calls this after a payment succeeds (and on a handful of other
// event types we don't act on). This is the one place that actually grants
// access: it records the purchase in the database and sends the access-link
// email. auth-signup.js later checks the `purchases` table before letting
// anyone create an account, so this function is what makes the paywall real
// rather than something a visitor could route around client-side.
//
// STRIPE_WEBHOOK_SECRET isn't set yet as of this commit -- it gets generated
// when this function's live URL is registered as a webhook endpoint in the
// Stripe dashboard (Developers -> Webhooks -> Add endpoint), which can only
// happen after this function is deployed. Until that secret is set, this
// function will reject every request (by design -- an unverified webhook
// should never be trusted).
import Stripe from "stripe";
import crypto from "node:crypto";
import { getDatabase } from "@netlify/database";
import { sendAccessEmail } from "./_lib/email.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = new Stripe(STRIPE_SECRET_KEY);
const db = getDatabase();

function formatOrderNumber(paymentIntentId) {
  return `TH-${paymentIntentId.slice(-8).toUpperCase()}`;
}

function formatAmount(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!STRIPE_WEBHOOK_SECRET) return new Response("Webhook is not configured yet.", { status: 500 });

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return new Response(`Webhook signature verification failed: ${e.message}`, { status: 400 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object;
      const email = (intent.receipt_email || intent.metadata?.email || "").trim().toLowerCase();

      if (email) {
        const orderNumber = formatOrderNumber(intent.id);
        const claimToken = crypto.randomBytes(24).toString("hex");

        // Stripe can and does retry webhook delivery. The UNIQUE constraint
        // on stripe_payment_intent_id makes this insert idempotent: a retry
        // hits a duplicate-key error, we catch it, and we skip sending a
        // second access email for the same payment.
        let inserted = false;
        try {
          await db.sql`
            INSERT INTO purchases (email, stripe_payment_intent_id, order_number, claim_token, amount_cents)
            VALUES (${email}, ${intent.id}, ${orderNumber}, ${claimToken}, ${intent.amount})
          `;
          inserted = true;
        } catch (e) {
          if (!String(e.message).includes("duplicate key")) throw e;
        }

        if (inserted) {
          const accessLink = `https://trueherfjournal.com/welcome?token=${claimToken}`;
          try {
            await sendAccessEmail(email, {
              accessLink,
              orderNumber,
              amount: formatAmount(intent.amount),
              date: formatDate(new Date()),
            });
          } catch (e) {
            // Don't fail the webhook over an email hiccup -- Stripe would
            // interpret a non-2xx response as "retry the whole event," and
            // the purchase itself is already safely recorded either way.
            console.error("Failed to send access email:", e);
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook handler error:", e);
    return new Response(JSON.stringify({ error: String(e && e.message ? e.message : e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
