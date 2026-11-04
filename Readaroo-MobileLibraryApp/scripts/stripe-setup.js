// One-time Stripe test-mode setup:
//   1. creates (or finds) the "readaroo_instant_borrow" billing meter
//   2. creates (or finds) one test customer per library
//   3. saves each customer id on the library row in Postgres
// Run after npm run db:setup:  npm run stripe:setup
'use strict';
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { assertTestKey, EVENT_NAME } = require('../src/stripeMeter');

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set. See docs/SETUP_STRIPE.md, step 2.');
  assertTestKey(key);
  const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. See docs/SETUP_POSTGRES.md.');

  const stripe = new (require('stripe'))(key);

  const meters = await stripe.billing.meters.list({ limit: 100 });
  let meter = meters.data.find((m) => m.event_name === EVENT_NAME && m.status === 'active');
  if (!meter) {
    meter = await stripe.billing.meters.create({
      display_name: 'Readaroo instant borrows (cents)',
      event_name: EVENT_NAME,
      default_aggregation: { formula: 'sum' },
      customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' },
      value_settings: { event_payload_key: 'value' },
    });
    console.log(`Created meter ${meter.id} (${EVENT_NAME})`);
  } else {
    console.log(`Using existing meter ${meter.id} (${EVENT_NAME})`);
  }

  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const libs = (await db.query('SELECT id, name, stripe_customer_id FROM libraries ORDER BY id')).rows;
    for (const lib of libs) {
      let customerId = lib.stripe_customer_id;
      if (!customerId) {
        const found = await stripe.customers.search({ query: `metadata['readaroo_library_id']:'${lib.id}'` });
        const cust = found.data[0] || await stripe.customers.create({
          name: `${lib.name} (Readaroo demo)`,
          email: `${lib.id}@readaroo.example`,
          metadata: { readaroo_library_id: lib.id, synthetic: 'true' },
        });
        customerId = cust.id;
        await db.query('UPDATE libraries SET stripe_customer_id = $2 WHERE id = $1', [lib.id, customerId]);
      }
      console.log(`${lib.name}: ${customerId}`);
    }
  } finally {
    await db.end();
  }
  console.log('Stripe test mode is ready. Restart the app; the footer should say "Stripe: test mode".');
}

main().catch((e) => {
  console.error(`Stripe setup failed: ${e.message}`);
  process.exit(1);
});
