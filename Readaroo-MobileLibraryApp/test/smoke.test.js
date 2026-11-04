// End-to-end smoke test: starts the real server offline on a free port and walks the
// whole workflow through the HTTP API, including the failure paths.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../server');
const { assertTestKey } = require('../src/stripeMeter');
const { createEngine } = require('../src/engine');
const { createMemoryStore, createFakeMeter } = require('../src/memoryStore');
const seed = require('../data/seed.json');

let srv;
let base;

async function api(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

test.before(async () => {
  srv = await start({ offline: true, port: 0, host: '127.0.0.1' });
  base = srv.url;
});
test.after(() => new Promise((r) => srv.server.close(r)));

test('health reports offline mode', async () => {
  const r = await api('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'offline');
});

test('web app is served', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Readaroo/);
});

test('installable app: manifest, service worker and icons are served', async () => {
  const man = await fetch(base + '/manifest.webmanifest');
  assert.equal(man.status, 200);
  const m = await man.json();
  assert.equal(m.name, 'Readaroo');
  assert.equal(m.display, 'standalone');
  for (const ic of m.icons) {
    const r = await fetch(`${base}/${ic.src}`);
    assert.equal(r.status, 200, ic.src);
    assert.match(r.headers.get('content-type'), /image\/png/);
  }
  const sw = await fetch(base + '/sw.js');
  assert.equal(sw.status, 200);
  assert.match(sw.headers.get('content-type'), /javascript/);
  assert.equal((await fetch(base + '/icons/apple-touch-icon.png')).status, 200);
});

test('R1 hero run: held book offers three available read-alikes', async () => {
  const r = await api('GET', '/api/titles/t-moonfox-2?actor=m-arjun');
  assert.equal(r.status, 200);
  assert.equal(r.body.hold.position, 14);
  assert.equal(r.body.hold.waitLabel, '4–7 weeks');
  const ids = r.body.nextUp.suggestions.map((s) => s.titleId);
  assert.deepEqual(ids, ['t-comet-1', 't-badger', 't-owl']);
  assert.ok(!ids.includes('t-moonfox-1'), 'already-read books are not suggested');
  const b = await api('POST', '/api/borrow', { actor: 'm-arjun', titleId: 't-comet-1' });
  assert.equal(b.body.outcome, 'borrowed');
  const again = await api('POST', '/api/borrow', { actor: 'm-arjun', titleId: 't-comet-1' });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'already_borrowed');
});

test('R2 smart holds: hold goes to the shortest line', async () => {
  const r = await api('POST', '/api/holds', { actor: 'm-arjun', titleId: 't-starlight' });
  assert.equal(r.body.outcome, 'hold_placed');
  assert.equal(r.body.libraryName, 'Riverbend City Library');
  const dup = await api('POST', '/api/holds', { actor: 'm-arjun', titleId: 't-starlight' });
  assert.equal(dup.body.outcome, 'already_on_hold');
});

test('R3 instant borrow under cap is metered once', async () => {
  const r = await api('POST', '/api/instant', { actor: 'm-arjun', titleId: 't-comet-2' });
  assert.equal(r.status, 200);
  assert.equal(r.body.outcome, 'instant_borrowed');
  assert.equal(r.body.priceCents, 249);
  assert.equal(r.body.remainingDailyCents, 551);
  const lib = await api('GET', '/api/library');
  const county = lib.body.libraries.find((l) => l.id === 'lib-county');
  assert.equal(county.spentTodayCents, 249);
  assert.equal(county.meterEvents.length, 1);
  const twice = await api('POST', '/api/instant', { actor: 'm-arjun', titleId: 't-comet-2' });
  assert.equal(twice.status, 409, 'cannot instant-borrow a book already checked out');
});

test('R4 cap reached: instant borrow refused, nothing charged, hold placed', async () => {
  const view = await api('GET', '/api/titles/t-tide-2?actor=m-arjun');
  assert.equal(view.body.instant.eligible, false, 'the page does not offer it');
  assert.equal(view.body.instant.capReached, true);
  const r = await api('POST', '/api/instant', { actor: 'm-arjun', titleId: 't-tide-2' });
  assert.equal(r.body.outcome, 'instant_refused');
  assert.equal(r.body.reason, 'daily cap reached');
  assert.equal(r.body.charged, false);
  assert.equal(r.body.hold.outcome, 'hold_placed');
  const lib = await api('GET', '/api/library');
  const city = lib.body.libraries.find((l) => l.id === 'lib-city');
  assert.equal(city.spentTodayCents, 300, 'spend never passes the cap');
  assert.equal(city.meterEvents.length, 0);
  assert.equal(city.refusals, 1);
});

test('R5 parent approval: kid request waits, only a parent decides', async () => {
  const r = await api('POST', '/api/borrow', { actor: 'm-arjun', titleId: 't-deepsea' });
  assert.equal(r.body.outcome, 'approval_required');
  const id = r.body.approvalId;
  const kidTry = await api('POST', `/api/approvals/${id}`, { actor: 'm-arjun', decision: 'approve' });
  assert.equal(kidTry.status, 403);
  const bad = await api('POST', `/api/approvals/${id}`, { actor: 'm-priya', decision: 'maybe' });
  assert.equal(bad.status, 400);
  const ok = await api('POST', `/api/approvals/${id}`, { actor: 'm-priya', decision: 'approve' });
  assert.equal(ok.body.outcome, 'approved');
  assert.equal(ok.body.fulfilment.outcome, 'borrowed');
  const again = await api('POST', `/api/approvals/${id}`, { actor: 'm-priya', decision: 'approve' });
  assert.equal(again.status, 409);
});

test('R6 stale availability blocks borrowing until refreshed', async () => {
  const d = await api('GET', '/api/titles/t-lighthouse?actor=m-arjun');
  assert.equal(d.body.availability[0].status, 'check');
  const b = await api('POST', '/api/borrow', { actor: 'm-arjun', titleId: 't-lighthouse' });
  assert.equal(b.status, 409);
  assert.equal(b.body.code, 'stale');
  await api('POST', '/api/refresh', { actor: 'm-priya', titleId: 't-lighthouse' });
  const b2 = await api('POST', '/api/borrow', { actor: 'm-arjun', titleId: 't-lighthouse' });
  assert.equal(b2.body.outcome, 'borrowed');
});

test('R7 unknown reading level: shown as unknown, kid needs approval', async () => {
  const d = await api('GET', '/api/titles/t-whiskers?actor=m-arjun');
  assert.equal(d.body.title.level, 'Level unknown');
  assert.equal(d.body.needsApproval, true);
  const r = await api('POST', '/api/borrow', { actor: 'm-arjun', titleId: 't-whiskers' });
  assert.equal(r.body.outcome, 'approval_required');
});

test('R8 clean run: in-band, available, borrowed in one call', async () => {
  const r = await api('POST', '/api/borrow', { actor: 'm-maya', titleId: 't-puddle' });
  assert.equal(r.body.outcome, 'borrowed');
});

test('kid reaction and parent-only digest', async () => {
  const home = await api('GET', '/api/home?actor=m-maya');
  const b = home.body.reading.find((x) => x.memberId === 'm-maya' && x.titleId === 't-puddle');
  const r = await api('POST', '/api/reactions', { actor: 'm-maya', borrowId: b.id, reaction: 'loved' });
  assert.equal(r.body.outcome, 'reacted');
  const kidDigest = await api('GET', '/api/digest?actor=m-maya');
  assert.equal(kidDigest.status, 403);
  const dg = await api('GET', '/api/digest?actor=m-priya');
  const maya = dg.body.members.find((m) => m.memberId === 'm-maya');
  assert.ok(maya.books.some((x) => x.title === 'Puddle Jumpers' && x.reaction === 'loved'));
});

test('bad input returns clear 4xx errors', async () => {
  assert.equal((await api('GET', '/api/home')).status, 400);
  assert.equal((await api('GET', '/api/home?actor=nobody')).status, 404);
  assert.equal((await api('GET', '/api/titles/t-nope?actor=m-priya')).status, 404);
  assert.equal((await api('POST', '/api/borrow', { actor: 'm-arjun' })).status, 400);
  assert.equal((await api('POST', '/api/borrow', { actor: 'm-maya', member: 'm-arjun', titleId: 't-owl' })).status, 403);
  assert.equal((await api('POST', '/api/feedback', { actor: 'm-priya', heldTitleId: 't-moonfox-2', suggestedTitleId: 't-owl', vote: 'meh' })).status, 400);
  assert.equal((await api('GET', '/api/nothing-here')).status, 404);
  const res = await fetch(base + '/api/borrow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
});

test('every action is in the audit log', async () => {
  const ev = await api('GET', '/api/events?actor=m-priya');
  const types = new Set(ev.body.events.map((e) => e.type));
  for (const t of ['borrow.created', 'hold.placed', 'instant.borrowed', 'instant.refused', 'approval.requested', 'approval.approved', 'reaction.added', 'availability.refreshed']) {
    assert.ok(types.has(t), `missing event ${t}`);
  }
});

test('reset restores the demo data', async () => {
  const r = await api('POST', '/api/reset', {});
  assert.equal(r.body.outcome, 'reset');
  const lib = await api('GET', '/api/library');
  assert.equal(lib.body.libraries.find((l) => l.id === 'lib-county').spentTodayCents, 0);
});

test('Stripe guard refuses live keys', () => {
  assert.throws(() => assertTestKey('sk_live_abc'), /live key/);
  assert.throws(() => assertTestKey('pk_test_abc'), /should start with sk_test_/);
  assert.doesNotThrow(() => assertTestKey('sk_test_abc'));
});

test('a failed Stripe call cancels the borrow and releases the budget', async () => {
  const store = createMemoryStore(seed);
  const engine = createEngine({ store, meter: async () => { throw new Error('network down'); } });
  const r = await engine.handle('POST', '/api/instant', { actor: 'm-arjun', titleId: 't-comet-2' }, {});
  assert.equal(r.status, 502);
  const lib = await store.getLibrary('lib-county');
  assert.equal(lib.spentTodayCents, 0);
  assert.equal((await store.listBorrows()).filter((b) => b.kind === 'instant').length, 0);
});

test('fake meter is idempotent by key', async () => {
  const meter = createFakeMeter();
  const a = await meter({ idempotencyKey: 'borrow:x' });
  const b = await meter({ idempotencyKey: 'borrow:x' });
  assert.equal(a.id, b.id);
});
