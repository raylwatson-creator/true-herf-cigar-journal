// Creates a Stripe PaymentIntent for the $2.99 one-time purchase. The frontend
// checkout screen (Stripe Elements) calls this first to get a client secret,
// then confirms the payment against Stripe directly -- the card number never
// passes through this function or this server.
import Stripe from "stripe";
import { EMAIL_RE } from "./_lib/auth.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = new Stripe(STRIPE_SECRET_KEY);

const PRICE_CENTS = 299; // $2.99, matches the price shown everywhere in the app copy.

const json = (statusCode, body) =>
  new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  if (!STRIPE_SECRET_KEY) return json(500, { error: "Payments are not configured yet." });

  try {
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
    return json(500, { error: String(e && e.message ? e.message : e) });
  }
};
