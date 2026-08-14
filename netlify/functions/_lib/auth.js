import crypto from "node:crypto";

// Set this in Netlify's environment variables (Site settings -> Environment
// variables). It signs session tokens -- treat it like a password. Generate
// one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const SESSION_SECRET = process.env.SESSION_SECRET;

// --- PIN hashing -----------------------------------------------------------
// Salted scrypt. The PIN itself is never stored -- only this hash.
export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pin), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(String(pin), salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- Session tokens ----------------------------------------------------------
// Lightweight HMAC-signed token (no expiry -- "stay logged in until logout").
// Format: base64url(payload).base64url(signature)
function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

export function signSession(userId) {
  if (!SESSION_SECRET) throw new Error("SESSION_SECRET is not configured");
  const payload = base64url(JSON.stringify({ uid: userId, iat: Date.now() }));
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(token) {
  if (!SESSION_SECRET || !token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data && data.uid ? data : null;
  } catch {
    return null;
  }
}

export function getBearerToken(req) {
  const header = req.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

// --- Reset codes -------------------------------------------------------------
// Short-lived and single-use, so a fast plain hash (not scrypt) is fine here.
export function hashResetCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

export function generateResetCode() {
  return String(crypto.randomInt(100000, 1000000)); // 6 digits
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PIN_RE = /^\d{4}$/;
