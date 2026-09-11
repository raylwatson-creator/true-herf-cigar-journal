// Creates a Stripe PaymentIntent for the $2.99 one-time purchase. The frontend
// checkout screen (Stripe Elements) calls this first to get a client secret,
// then confirms the payment against Stripe directly -- the card number never
// passes through this function or this server.
import Stripe from "stripe";
import { getDatabase } from "@netlify/database";
import { EMAIL_RE } from "./_lib/auth.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = new Stripe(STRIPE_SECRET_KEY);
const db = getDatabase();

const PRICE_CENTS = 299; // $2.99, matches the price shown everywhere in the app copy.

// This is a public, unauthenticated endpoint that creates a real Stripe
// PaymentIntent for any email submitted. No funds move until a card is
// actually confirmed, so the risk is API abuse, not fund theft, but there
// was previously no throttle at all.
const CHECKOUT_RATE_LIMIT = 8;
const CHECKOUT_RATE_WINDOW_MINUTES = 10;

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

function getClientIp(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (!STRIPE_SECRET_KEY) return json(500, { error: "Payments are not configured yet." });

  try {
    const ip = getClientIp(req);
    // The interval below is a fixed literal, not the CHECKOUT_RATE_WINDOW_MINUTES
    // constant -- db.sql's tagged template treats every ${...} as a bound
    // parameter, which can't be spliced into the middle of a quoted interval
    // literal like '10 minutes'. Keep this in sync with the constant above by hand.
    const [{ count }] = await db.sql`
      SELECT COUNT(*)::int AS count FROM checkout_rate_limit
      WHERE ip = ${ip} AND created_at > NOW() - INTERVAL '10 minutes'
    `;
    if (count >= CHECKOUT_RATE_LIMIT) {
      return json(429, { error: "Too many attempts. Please wait a few minutes and try again." });
    }
    await db.sql`INSERT INTO checkout_rate_limit (ip) VALUES (${ip})`;
    // Opportunistic cleanup so this table doesn't grow unbounded -- cheap
    // given the index on (ip, created_at), and harmless to skip on any one
    // request since it just runs again next time.
    await db.sql`DELETE FROM checkout_rate_limit WHERE created_at < NOW() - INTERVAL '1 day'`;

    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();

    if (!EMAIL_RE.test(email)) {
      return json(400, { error: "Enter a valid email address." });
    }

    const intent = await stripe.paymentIntents.create({
      amount: PRICE_CENTS,
      currency: "usd",
      receipt_email: email,
      // Card only, matching the frontend's plain Card Element (not the
      // unified Payment Element). Deliberately not using
      // automatic_payment_methods: it offers Bank, Klarna, Cash App Pay,
      // and Amazon Pay regardless of "allow_redirects: never", and all of
      // those need a full page redirect-and-return that this checkout (a
      // single-page confirm-and-done flow) doesn't handle.
      payment_method_types: ["card"],
      metadata: { email, product: "true_herf_full_access" },
    });

    return json(200, { clientSecret: intent.client_secret });
  } catch (e) {
    console.error("create-payment-intent error:", e);
    return json(500, { error: "Something went wrong. Please try again." });
  }
};
