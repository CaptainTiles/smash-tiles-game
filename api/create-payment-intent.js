/*
 * Called by the game's in-game payment box (card / PayPal).
 * Request:  POST { playerUid, itemHandles: [...], method: "card" | "paypal" }
 * Response: { clientSecret, amount (cents), id }
 * The item is granted later by webhook.js, once Stripe confirms the payment.
 */
import { CURRENCY, isSubscription, resolveItems, totalCents } from './_lib/catalog.js';
import { ClientError, json, playerUid, preflight, readJson, run, setting } from './_lib/http.js';
import { StripeApiError, stripeRequest } from './_lib/stripe.js';

export const OPTIONS = preflight;

export function POST(request) {
  return run(request, async () => {
    const body = await readJson(request);
    const uid = playerUid(body.playerUid);
    const items = resolveItems(body.itemHandles);
    if (isSubscription(items)) throw new ClientError('Subscriptions are paid on the secure checkout page.');

    const method = body.method || 'card';
    let methodTypes;
    if (method === 'paypal') {
      if (setting('PAYPAL_ENABLED') !== 'true') throw new ClientError('PayPal is not available right now. Please pay by card.');
      methodTypes = ['paypal'];
    } else if (method === 'card') {
      methodTypes = ['card'];
    } else {
      throw new ClientError('Unknown payment method.');
    }

    let intent;
    try {
      intent = await stripeRequest('POST', 'payment_intents', {
        amount: totalCents(items),
        currency: CURRENCY,
        payment_method_types: methodTypes,
        description: 'SMASH TILES: ' + items.map((i) => i.name).join(', '),
        metadata: {
          source: 'smash-paybox',
          playerUid: uid,
          itemHandles: items.map((i) => i.handle).join(','),
        },
      });
    } catch (err) {
      if (!(err instanceof StripeApiError)) throw err;
      console.error('create-payment-intent:', err.message);
      throw new ClientError(method === 'paypal'
        ? 'PayPal is not available right now. Please pay by card.'
        : 'Could not prepare the payment. Please try again.', 502);
    }

    return json(200, { clientSecret: intent.client_secret, amount: intent.amount, id: intent.id });
  });
}
