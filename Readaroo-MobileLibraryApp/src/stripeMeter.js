// Records library-funded instant borrows as Stripe Billing meter events (test mode only).
'use strict';

const EVENT_NAME = process.env.STRIPE_METER_EVENT_NAME || 'readaroo_instant_borrow';

function assertTestKey(key) {
  if (!key) return;
  if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) {
    throw new Error('Refusing to start: STRIPE_SECRET_KEY is a live key. Readaroo only runs with Stripe test-mode keys (sk_test_...).');
  }
  if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
    throw new Error('STRIPE_SECRET_KEY should start with sk_test_ (or rk_test_ for a restricted key). See docs/SETUP_STRIPE.md.');
  }
}

function createStripeMeter(secretKey) {
  assertTestKey(secretKey);
  const Stripe = require('stripe');
  const stripe = new Stripe(secretKey);
  return async function meter({ customerId, valueCents, idempotencyKey }) {
    if (!customerId) {
      throw new Error('This library has no Stripe customer yet. Run npm run stripe:setup (docs/SETUP_STRIPE.md).');
    }
    const ev = await stripe.billing.meterEvents.create({
      event_name: EVENT_NAME,
      // `identifier` makes Stripe drop a duplicate if we retry the same borrow.
      identifier: idempotencyKey,
      payload: { stripe_customer_id: customerId, value: String(valueCents) },
    });
    return { id: ev.identifier || idempotencyKey, mode: 'stripe test mode' };
  };
}

module.exports = { createStripeMeter, assertTestKey, EVENT_NAME };
