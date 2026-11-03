/*
 * Minimal Firestore REST client authenticated with the Firebase service account
 * (signed with node:crypto, no Google SDK needed). Only does what the payment
 * server needs: create a document once.
 */
import crypto from 'node:crypto';
import { setting } from './http.js';

let account = null;
let cachedToken = null; // kept while this function instance stays warm

export function serviceAccount() {
  if (!account) {
    let parsed = null;
    try {
      parsed = JSON.parse(setting('FIREBASE_SERVICE_ACCOUNT'));
    } catch {
      // handled below
    }
    if (!parsed?.private_key || !parsed?.client_email || !parsed?.project_id) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is missing or invalid');
    }
    account = parsed;
  }
  return account;
}

const base64url = (data) => Buffer.from(data).toString('base64url');

/** Builds the signed JWT that Google exchanges for an access token. */
export function signedJwt(acct, now) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: acct.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: acct.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(acct.private_key, 'base64url');
  return `${header}.${claims}.${signature}`;
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expires > now + 60) return cachedToken.token;

  const acct = serviceAccount();
  const res = await fetch(acct.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt(acct, now),
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token request failed (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  cachedToken = { token: data.access_token, expires: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

/** Converts a JS value to Firestore's typed JSON value format. */
export function firestoreValue(value) {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value === null || value === undefined) return { nullValue: null };
  return { stringValue: String(value) };
}

/**
 * Creates collection/docId with fields. Returns true if created, false if the
 * document already existed (so repeated webhooks never overwrite it).
 */
export async function createDocument(collection, docId, fields) {
  const acct = serviceAccount();
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(acct.project_id)}`
    + `/databases/(default)/documents/${encodeURIComponent(collection)}?documentId=${encodeURIComponent(docId)}`;
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, firestoreValue(v)])) };

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (res.ok) return true;
  if (res.status === 409) return false; // ALREADY_EXISTS
  throw new Error(`Firestore write failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
}
