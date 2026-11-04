// Optional live-mode test against a real Postgres. Skipped unless TEST_DATABASE_URL is set.
//   TEST_DATABASE_URL=postgres://...  TEST_DATABASE_ADMIN_URL=postgres://...  npm test
// It reloads the demo data, so never point it at a database you care about.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const appUrl = process.env.TEST_DATABASE_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL || appUrl;

test('live mode against Postgres', { skip: !appUrl && 'set TEST_DATABASE_URL to run' }, async (t) => {
  const fs = require('fs');
  const path = require('path');
  const { Client } = require('pg');
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(fs.readFileSync(path.join(__dirname, '..', 'db', '002_seed.sql'), 'utf8'));
  await admin.end();

  process.env.DATABASE_URL = appUrl;
  delete process.env.STRIPE_SECRET_KEY;
  const { start } = require('../server');
  const s = await start({ offline: false, port: 0 });
  const j = async (m, p, body) => {
    const r = await fetch(s.url + p, { method: m, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  try {
    await t.test('walks the demo records', async () => {
      assert.equal((await j('GET', '/api/health')).body.mode, 'live');
      const d = await j('GET', '/api/titles/t-moonfox-2?actor=m-arjun');
      assert.deepEqual(d.body.nextUp.suggestions.map((x) => x.titleId), ['t-comet-1', 't-badger', 't-owl']);
      assert.equal((await j('POST', '/api/holds', { actor: 'm-arjun', titleId: 't-starlight' })).body.libraryName, 'Riverbend City Library');
      assert.equal((await j('POST', '/api/instant', { actor: 'm-arjun', titleId: 't-comet-2' })).body.outcome, 'instant_borrowed');
      assert.equal((await j('POST', '/api/instant', { actor: 'm-arjun', titleId: 't-tide-2' })).body.outcome, 'instant_refused');
      const a = await j('POST', '/api/borrow', { actor: 'm-arjun', titleId: 't-deepsea' });
      assert.equal(a.body.outcome, 'approval_required');
      assert.equal((await j('POST', `/api/approvals/${a.body.approvalId}`, { actor: 'm-priya', decision: 'approve_series' })).body.outcome, 'approved');
      assert.equal((await j('POST', '/api/borrow', { actor: 'm-maya', titleId: 't-puddle' })).body.outcome, 'borrowed');
      assert.equal((await j('POST', '/api/reset', {})).status, 403);
    });
    await t.test('v1.1 features work on Postgres', async () => {
      assert.equal((await j('GET', '/api/lists?actor=m-arjun')).body.readyCount, 1);
      const s1 = await j('POST', '/api/sessions', { actor: 'm-arjun', borrowId: 'borrow-4', clientId: 'live-1', minutes: 3, toPage: 120 });
      assert.equal(s1.body.savedMinutes, 3);
      const s2 = await j('POST', '/api/sessions', { actor: 'm-arjun', borrowId: 'borrow-4', clientId: 'live-1', minutes: 6, toPage: 125 });
      assert.equal(s2.body.savedMinutes, 3);
      assert.equal(s2.body.streak.current, 9);
      assert.equal((await j('GET', '/api/discover?actor=m-arjun')).body.picks[0].id, 't-moonfox-2');
      assert.equal((await j('POST', '/api/tbr', { actor: 'm-arjun', titleId: 't-owl' })).body.outcome, 'listed');
      assert.equal((await j('POST', '/api/follow', { actor: 'm-arjun', kind: 'author', value: 'Sam Whitlow' })).body.outcome, 'followed');
      const b = await j('POST', '/api/meetups/meet-okafor/rsvp', { actor: 'm-priya', attendees: ['m-arjun'] });
      assert.equal(b.body.outcome, 'going');
      assert.equal((await j('POST', '/api/meetups/meet-okafor/cancel', { actor: 'm-priya' })).body.outcome, 'cancelled');
    });
    await t.test('parallel bookings never overfill a room', async () => {
      const results = await Promise.all(Array.from({ length: 10 }, () => s.deps.store.takeSeats('meet-okafor', 2)));
      const m = await s.deps.store.getMeetup('meet-okafor');
      assert.ok(m.seatsTaken <= m.capacity);
      assert.equal(results.filter((r) => r.ok).length, 1, 'only one pair fits in the 3 seats left');
    });
    await t.test('parallel instant charges never pass the cap', async () => {
      const results = await Promise.all(Array.from({ length: 10 }, () => s.deps.store.reserveBudget('lib-county', 249, '2026-11-03')));
      const lib = await s.deps.store.getLibrary('lib-county');
      assert.ok(lib.spentTodayCents <= lib.dailyCapCents);
      assert.ok(results.some((r) => !r.ok));
    });
  } finally {
    await new Promise((r) => s.server.close(r));
    await s.deps.store.close();
  }
});
