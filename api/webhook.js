/*
 * Stripe calls this address when a payment goes through. It is the ONLY thing
 * that records a purchase: it writes purchases/{id} = { playerUid, itemHandles,
 * granted:false, ... } in Firestore, and the game picks that up and gives the item.
 *
 * Stripe Dashboard > Developers > Webhooks > Add destination:
 *   URL:    https://www.smashtiles.com/api/webhook
 *   Events: payment_intent.succeeded, checkout.session.completed,
 *           checkout.session.async_payment_succeeded, invoice.paid
 */
import { CATALOG, CURRENCY } from './_lib/catalog.js';
import { createDocument } from './_lib/firestore.js';
import { json, run, setting } from './_lib/http.js';
import { stripeRequest, verifyWebhook } from './_lib/stripe.js';

/** Writes the purchase record the game is waiting for. Safe to call repeatedly for the same id. */
async function recordPurchase(docId, metadata, amountCents, currency, kind, livemode) {
  const uid = metadata?.playerUid || '';
  const handles = String(metadata?.itemHandles || '').split(',').filter(Boolean);
  if (!/^[A-Za-z0-9]{10,128}$/.test(uid) || !handles.length) {
    console.warn(`webhook: ${docId} has no usable playerUid/itemHandles in metadata, skipped`);
    return;
  }
  const unknown = handles.find((h) => !Object.hasOwn(CATALOG, h));
  if (unknown) {
    console.warn(`webhook: ${docId} contains unknown item '${unknown}', skipped`);
    return;
  }

  const created = await createDocument('purchases', docId, {
    playerUid: uid,
    itemHandles: handles,
    granted: false,
    amountCents,
    currency,
    kind,
    livemode,
    createdAt: new Date(),
  });
  console.log(`webhook: purchase ${docId} (${handles.join(',')} for ${uid}) ${created ? 'recorded' : 'already recorded'}`);
}

/** Subscription metadata sits in a different place depending on the webhook's API version; fetch it as a last resort. */
async function invoiceSubscriptionMetadata(invoice) {
  const meta = invoice.subscription_details?.metadata ?? invoice.parent?.subscription_details?.metadata;
  if (meta?.playerUid) return meta;
  let subscriptionId = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
  if (subscriptionId && typeof subscriptionId === 'object') subscriptionId = subscriptionId.id;
  if (typeof subscriptionId !== 'string' || !subscriptionId) return {};
  const subscription = await stripeRequest('GET', `subscriptions/${encodeURIComponent(subscriptionId)}`);
  return subscription.metadata || {};
}

export function POST(request) {
  return run(request, async () => {
    const payload = await request.text();
    const event = verifyWebhook(payload, request.headers.get('stripe-signature'), setting('STRIPE_WEBHOOK_SECRET'));

    const object = event.data.object;
    const livemode = Boolean(event.livemode);
    const source = object.metadata?.source || '';

    switch (event.type) {
      // in-game payment box (card / PayPal)
      case 'payment_intent.succeeded':
        if (source === 'smash-paybox') {
          await recordPurchase(object.id, object.metadata, Number(object.amount_received), object.currency, 'paybox', livemode);
        }
        break;

      // Stripe hosted checkout page (subscriptions, first payment)
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (source === 'smash-checkout' && ['paid', 'no_payment_required'].includes(object.payment_status)) {
          await recordPurchase(object.id, object.metadata, Number(object.amount_total || 0), object.currency || CURRENCY, 'checkout', livemode);
        }
        break;

      // subscription renewals (the first payment is already handled by checkout.session.completed)
      case 'invoice.paid':
        if (object.billing_reason === 'subscription_cycle') {
          const meta = await invoiceSubscriptionMetadata(object);
          if (meta.source === 'smash-checkout') {
            await recordPurchase(object.id, meta, Number(object.amount_paid || 0), object.currency || CURRENCY, 'renewal', livemode);
          }
        }
        break;
    }

    return json(200, { received: true });
  });
}
