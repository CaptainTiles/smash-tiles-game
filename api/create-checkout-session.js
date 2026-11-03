/*
 * Called by the game for subscriptions (they renew, so they use Stripe's hosted page).
 * Also works for one-off items if the game ever sends them here.
 * Request:  POST { playerUid, itemHandles: [...], returnUrl }
 * Response: { url }  -> the game sends the player to that Stripe page.
 */
import { CURRENCY, isSubscription, resolveItems } from './_lib/catalog.js';
import { ClientError, allowedOrigins, json, playerUid, preflight, readJson, run } from './_lib/http.js';
import { StripeApiError, stripeRequest } from './_lib/stripe.js';

export const OPTIONS = preflight;

/** Only send players back to the game's own site, never to an address supplied by someone else. */
function safeReturnUrl(value) {
  let url;
  try {
    url = typeof value === 'string' && value.length <= 1000 ? new URL(value) : null;
  } catch {
    url = null;
  }
  if (!url || !/^https?:$/.test(url.protocol)) throw new ClientError('Invalid return address.');
  if (!allowedOrigins().includes(url.origin)) throw new ClientError('This site is not allowed to start a checkout.', 403);
  return url.origin + url.pathname;
}

export function POST(request) {
  return run(request, async () => {
    const body = await readJson(request);
    const uid = playerUid(body.playerUid);
    const items = resolveItems(body.itemHandles);
    const returnUrl = safeReturnUrl(body.returnUrl);
    const subscription = isSubscription(items);
    if (subscription && items.length !== 1) throw new ClientError('A subscription must be bought on its own.');

    const metadata = { source: 'smash-checkout', playerUid: uid, itemHandles: items.map((i) => i.handle).join(',') };
    const params = {
      mode: subscription ? 'subscription' : 'payment',
      line_items: items.map((item) => ({
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: item.cents,
          product_data: { name: item.name },
          recurring: item.interval ? { interval: item.interval } : undefined,
        },
      })),
      client_reference_id: uid,
      metadata,
      success_url: `${returnUrl}?smash_checkout=success`,
      cancel_url: `${returnUrl}?smash_checkout=cancel`,
      // The account has Stripe Managed Payments on by default, which needs a tax code on every
      // product. The in-game card box (PaymentIntents) doesn't use it, so keep both paths the same.
      managed_payments: { enabled: 'false' },
      // copied onto the subscription so every renewal invoice knows who to give the item to
      subscription_data: subscription ? { metadata } : undefined,
    };

    let session;
    try {
      session = await stripeRequest('POST', 'checkout/sessions', params);
    } catch (err) {
      if (!(err instanceof StripeApiError)) throw err;
      console.error('create-checkout-session:', err.message);
      throw new ClientError('Could not start checkout. Please try again.', 502);
    }

    return json(200, { url: session.url });
  });
}
