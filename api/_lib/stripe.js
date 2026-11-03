/*
 * Minimal Stripe API client (fetch, no npm packages) and webhook signature check.
 */
import crypto from 'node:crypto';
import { ClientError, setting } from './http.js';

const API = 'https://api.stripe.com/v1/';
// Pin the API version so Stripe changing its defaults can't change our responses.
const VERSION = '2024-06-20';

/** Error returned by the Stripe API (card declined, invalid parameter, ...). */
export class StripeApiError extends Error {}

/** Form-encodes nested params the way Stripe expects: line_items[0][price_data][currency]=cad */
function encode(params, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') encode(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

export async function stripeRequest(method, path, params = {}) {
  const secret = setting('STRIPE_SECRET_KEY');
  if (!/^(sk|rk)_(test|live)_/.test(secret)) {
    throw new Error('STRIPE_SECRET_KEY is missing or invalid');
  }
  const body = encode(params).toString();
  const url = API + path + (method === 'GET' && body ? `?${body}` : '');
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Stripe-Version': VERSION,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : body,
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`Stripe returned an unreadable response (HTTP ${res.status})`);
  if (!res.ok) throw new StripeApiError(data.error?.message || `Stripe error HTTP ${res.status}`);
  return data;
}

/**
 * Verifies the Stripe-Signature header and returns the decoded event.
 * See https://docs.stripe.com/webhooks#verify-manually
 */
export function verifyWebhook(payload, header, secret, tolerance = 300, now = Math.floor(Date.now() / 1000)) {
  let timestamp = null;
  const signatures = [];
  for (const part of (header || '').split(',')) {
    const [k, v] = part.trim().split('=', 2);
    if (k === 't') timestamp = Number(v);
    else if (k === 'v1' && v) signatures.push(v);
  }
  if (!timestamp || !signatures.length || !secret) throw new ClientError('Missing webhook signature.');

  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex'));
  const matched = signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!matched) throw new ClientError('Webhook signature does not match.');
  if (Math.abs(now - timestamp) > tolerance) throw new ClientError('Webhook timestamp is too old.');

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    event = null;
  }
  if (!event?.type || !event?.data?.object) throw new ClientError('Webhook body is not a Stripe event.');
  return event;
}
