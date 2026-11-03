/*
 * Shared helpers for the payment functions: settings from Vercel environment
 * variables, JSON responses, CORS and error handling.
 *
 * Environment variables (Vercel > Project > Settings > Environment Variables):
 *   STRIPE_SECRET_KEY          sk_test_... while testing, sk_live_... when live
 *   STRIPE_WEBHOOK_SECRET      whsec_... from the Stripe webhook destination
 *   FIREBASE_SERVICE_ACCOUNT   the whole Firebase service-account .json file, pasted as the value
 *   ALLOWED_ORIGINS            comma-separated, e.g. https://www.smashtiles.com,https://smashtiles.com
 *   PAYPAL_ENABLED             "true" only if PayPal is enabled on the Stripe account (EU/UK/CH only)
 */

/** An error caused by a bad request from the browser; its message is safe to show the player. */
export class ClientError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function setting(name) {
  return (process.env[name] || '').trim();
}

export function allowedOrigins() {
  return setting('ALLOWED_ORIGINS').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
}

export function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

/** CORS headers for the game when it calls from an allowed origin (same-origin calls don't need them). */
export function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  if (!origin || !allowedOrigins().includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
  };
}

export function preflight(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function readJson(request) {
  const raw = await request.text();
  if (raw.length > 16384) throw new ClientError('Request is too large.', 413);
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {
    // fall through
  }
  throw new ClientError('Expected a JSON body.');
}

/** Firebase user ids are letters and digits (28 for anonymous users); allow a little room. */
export function playerUid(uid) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9]{10,128}$/.test(uid)) {
    throw new ClientError('Missing or invalid player id. Please reload the game and try again.');
  }
  return uid;
}

/** Runs a handler, turning exceptions into JSON errors the game can show. */
export async function run(request, handler) {
  const cors = corsHeaders(request);
  try {
    const response = await handler();
    for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
    return response;
  } catch (err) {
    if (err instanceof ClientError) return json(err.status, { error: err.message }, cors);
    console.error(`${err.name}: ${err.message}`);
    return json(500, { error: 'The payment server had a problem. Please try again in a moment.' }, cors);
  }
}
