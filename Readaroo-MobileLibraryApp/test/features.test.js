// v1.1 features: lists by age group, reading tracker, streaks, picks, new releases, author talks and meetups.
// Runs the real server offline and calls the HTTP API, like smoke.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../server');
const { createEngine } = require('../src/engine');
const { createMemoryStore, createFakeMeter } = require('../src/memoryStore');
const seed = require('../data/seed.json');

let srv;
let base;
async function api(method, path, body) {
  const res = await fetch(base + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, type, body: type.includes('json') ? await res.json() : await res.text(), headers: res.headers };
}
const reset = () => api('POST', '/api/reset', {});

test.before(async () => {
  srv = await start({ offline: true, port: 0, host: '127.0.0.1' });
  base = srv.url;
});
test.after(() => new Promise((r) => srv.server.close(r)));

test('R9 lists: ready books first, shelves by age group, next level up marked', async () => {
  await reset();
  const r = await api('GET', '/api/lists?actor=m-arjun');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.list.map((x) => [x.id, x.status]), [['t-harbor', 'available'], ['t-starlight', 'waitlist']]);
  assert.equal(r.body.readyCount, 1);
  assert.deepEqual(r.body.shelves.map((s) => [s.id, s.stretch]), [['shelf-8-10', false], ['shelf-11-13', true]]);
  assert.ok(!r.body.shelves.some((s) => s.id === 'shelf-adult'), 'kids never see the grown-ups shelf');
  const parent = await api('GET', '/api/lists?actor=m-priya&member=m-maya');
  assert.ok(parent.body.shelves.find((s) => s.id === 'shelf-4-7').forWhom.includes('Maya'));
});

test('R9 lists: adding out-of-band is allowed with a note; adult books are not', async () => {
  await reset();
  const add = await api('POST', '/api/tbr', { actor: 'm-arjun', titleId: 't-deepsea' });
  assert.equal(add.body.outcome, 'listed');
  assert.match(add.body.message, /grown-up/);
  assert.equal((await api('POST', '/api/tbr', { actor: 'm-arjun', titleId: 't-deepsea' })).body.outcome, 'already_listed');
  assert.equal((await api('POST', '/api/tbr', { actor: 'm-arjun', titleId: 't-orchard' })).status, 403);
  assert.equal((await api('POST', '/api/tbr', { actor: 'm-arjun', member: 'm-maya', titleId: 't-puddle' })).status, 403);
  const gift = await api('POST', '/api/tbr', { actor: 'm-priya', member: 'm-maya', titleId: 't-puddle' });
  assert.match(gift.body.message, /Maya's list/);
  assert.equal((await api('POST', '/api/tbr/remove', { actor: 'm-arjun', titleId: 't-deepsea' })).body.outcome, 'removed');
  assert.equal((await api('POST', '/api/tbr/remove', { actor: 'm-arjun', titleId: 't-deepsea' })).status, 404);
});

test('R10 reader: opens where you left off; a repeated save does not double count', async () => {
  await reset();
  const open = await api('GET', '/api/reading/borrow-4?actor=m-arjun');
  assert.equal(open.body.currentPage, 112);
  assert.equal(open.body.pages, 176);
  const first = await api('POST', '/api/sessions', { actor: 'm-arjun', borrowId: 'borrow-4', clientId: 'tab-1', minutes: 3, toPage: 120 });
  assert.equal(first.body.savedMinutes, 3);
  // The page closes, the same session is saved again with more time
  const again = await api('POST', '/api/sessions', { actor: 'm-arjun', borrowId: 'borrow-4', clientId: 'tab-1', minutes: 7, toPage: 124 });
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.savedMinutes, 4);
  assert.equal(again.body.currentPage, 124);
  // A late, smaller duplicate changes nothing
  const stale = await api('POST', '/api/sessions', { actor: 'm-arjun', borrowId: 'borrow-4', clientId: 'tab-1', minutes: 2, toPage: 110 });
  assert.equal(stale.body.savedMinutes, 0);
  assert.equal(stale.body.currentPage, 124);
});

test('R10 reader: guardrails on input and ownership', async () => {
  await reset();
  const bad = (b) => api('POST', '/api/sessions', { actor: 'm-arjun', borrowId: 'borrow-4', clientId: 'tab-x', minutes: 5, ...b });
  assert.equal((await bad({ minutes: 0 })).status, 400);
  assert.equal((await bad({ minutes: 601 })).status, 400);
  assert.equal((await bad({ toPage: 999 })).status, 400);
  assert.equal((await bad({ clientId: 'x' })).status, 400);
  assert.equal((await api('GET', '/api/reading/borrow-5?actor=m-arjun')).status, 403, "a kid can't open a sibling's book");
  assert.equal((await api('GET', '/api/reading/borrow-5?actor=m-priya')).status, 200, 'a parent can, for read-alongs');
});

test('R10 reader: reaching the last page finishes the book', async () => {
  await reset();
  const r = await api('POST', '/api/sessions', { actor: 'm-maya', borrowId: 'borrow-5', clientId: 'tab-m', minutes: 12, toPage: 32 });
  assert.equal(r.body.outcome, 'finished');
  assert.equal((await api('POST', '/api/sessions', { actor: 'm-maya', borrowId: 'borrow-5', clientId: 'tab-m2', minutes: 2 })).status, 409);
});

test('R11 streaks: rest day keeps it alive, today extends it, broken streak gets a fresh start', async () => {
  await reset();
  const s = await api('GET', '/api/streaks?actor=m-priya');
  const by = Object.fromEntries(s.body.streaks.map((x) => [x.memberId, x]));
  assert.equal(by['m-arjun'].current, 8);
  assert.deepEqual(by['m-arjun'].restDays, ['2026-10-28']);
  assert.equal(by['m-arjun'].readToday, false);
  assert.equal(by['m-priya'].current, 3);
  assert.equal(by['m-maya'].current, 0);
  assert.match(by['m-maya'].message, /Fresh start/);
  assert.ok(!/miss|lost|broke/i.test(by['m-maya'].message), 'no scolding');
  // 4 minutes is not enough; 5 is
  await api('POST', '/api/sessions', { actor: 'm-arjun', borrowId: 'borrow-4', clientId: 'today-1', minutes: 4 });
  assert.equal((await api('GET', '/api/streaks?actor=m-arjun')).body.streaks[0].current, 8);
  await api('POST', '/api/sessions', { actor: 'm-arjun', borrowId: 'borrow-4', clientId: 'today-1', minutes: 5 });
  const after = (await api('GET', '/api/streaks?actor=m-arjun')).body.streaks[0];
  assert.equal(after.current, 9);
  assert.equal(after.readToday, true);
  assert.equal((await api('GET', '/api/streaks?actor=m-arjun')).body.streaks.length, 1, 'kids only see their own streak');
});

test('R12 picks: series next first, each with reasons, nothing already read', async () => {
  await reset();
  const d = await api('GET', '/api/discover?actor=m-arjun');
  const picks = d.body.picks;
  assert.equal(picks[0].id, 't-moonfox-2');
  assert.ok(picks[0].why.some((w) => w.startsWith('Next in Moon Fox')));
  assert.ok(picks.every((p) => p.why.length > 0));
  assert.ok(!picks.some((p) => ['t-moonfox-1', 't-kite'].includes(p.id)), 'no books already read or in progress');
  assert.ok(!picks.some((p) => p.id === 't-deepsea'), 'kids get in-band picks');
  const grownUp = await api('GET', '/api/discover?actor=m-priya&member=m-priya');
  assert.ok(grownUp.body.picks.every((p) => p.level === 'Adult'));
});

test('R12 picks: "not for me" pushes similar books down', async () => {
  const store = createMemoryStore(seed);
  const engine = createEngine({ store, meter: createFakeMeter() });
  const before = (await engine.handle('GET', '/api/discover', {}, { actor: 'm-arjun' })).body.picks.map((p) => p.id);
  await store.updateBorrow('borrow-1', {});
  await store.addReaction({ id: 'r-x', borrowId: 'borrow-1', memberId: 'm-arjun', reaction: 'not_for_me', at: '2026-11-03T19:00:00Z' });
  const after = (await engine.handle('GET', '/api/discover', {}, { actor: 'm-arjun' })).body.picks.map((p) => p.id);
  assert.notDeepEqual(before, after);
  assert.ok(!after.includes('t-badger'), 'animal-quest books drop once Moon Fox was not for him');
});

test('R13 releases: followed sequel first, pre-release hold counts from release day', async () => {
  await reset();
  const d = await api('GET', '/api/discover?actor=m-arjun');
  assert.equal(d.body.comingSoon[0].id, 't-moonfox-3');
  assert.equal(d.body.comingSoon[0].followed, true);
  assert.deepEqual(d.body.newArrivals.map((x) => x.id), ['t-harbor', 't-gnome-2'], 'newest first; 5-8 overlaps 8-10');
  const maya = await api('GET', '/api/discover?actor=m-maya');
  assert.ok(maya.body.newArrivals.some((x) => x.id === 't-gnome-2'));
  const h = await api('POST', '/api/holds', { actor: 'm-arjun', titleId: 't-moonfox-3' });
  assert.equal(h.body.outcome, 'hold_placed');
  assert.match(h.body.waitLabel, /after Dec 1/);
  const view = await api('GET', '/api/titles/t-moonfox-3?actor=m-arjun');
  assert.equal(view.body.availability[0].status, 'coming');
  assert.equal(view.body.nextUp && view.body.nextUp.suggestions.length > 0, true);
  assert.equal(view.body.instant.eligible, false);
});

test('R13 follows: follow and unfollow an author', async () => {
  await reset();
  assert.equal((await api('POST', '/api/follow', { actor: 'm-arjun', kind: 'author', value: 'Sam Whitlow' })).body.outcome, 'followed');
  assert.equal((await api('POST', '/api/follow', { actor: 'm-arjun', kind: 'author', value: 'Nobody' })).status, 404);
  assert.equal((await api('POST', '/api/follow', { actor: 'm-arjun', kind: 'genre', value: 'x' })).status, 400);
  assert.equal((await api('POST', '/api/follow', { actor: 'm-arjun', kind: 'author', value: 'Sam Whitlow', on: false })).body.outcome, 'unfollowed');
});

test('R14 meetups: matched to the family, past events hidden, kids see their ages only', async () => {
  await reset();
  const p = await api('GET', '/api/meetups?actor=m-priya');
  const ids = p.body.meetups.map((m) => m.id);
  assert.ok(!ids.includes('meet-past'));
  const okafor = p.body.meetups.find((m) => m.id === 'meet-okafor');
  assert.ok(okafor.why.includes('Arjun loved The Moon Fox'));
  assert.equal(okafor.seatsLeft, 3);
  const kid = await api('GET', '/api/meetups?actor=m-maya');
  assert.deepEqual(kid.body.meetups.map((m) => m.id), ['meet-storytime']);
});

test('R14 booking: adds a grown-up for under-13s, waitlists when full, frees seats on cancel', async () => {
  await reset();
  const b = await api('POST', '/api/meetups/meet-okafor/rsvp', { actor: 'm-priya', attendees: ['m-arjun'] });
  assert.equal(b.body.outcome, 'going');
  assert.deepEqual(b.body.attendees, ['m-arjun', 'm-priya']);
  assert.equal(b.body.seatsLeft, 1);
  assert.equal((await api('POST', '/api/meetups/meet-okafor/rsvp', { actor: 'm-priya', attendees: ['m-arjun'] })).status, 409);
  const full = await api('POST', '/api/meetups/meet-storytime/rsvp', { actor: 'm-priya', attendees: ['m-maya'] });
  assert.equal(full.body.outcome, 'waitlist');
  assert.equal((await api('POST', '/api/meetups/meet-okafor/rsvp', { actor: 'm-priya', attendees: ['m-maya'] })).status, 409, 'age check');
  assert.equal((await api('POST', '/api/meetups/meet-vance/rsvp', { actor: 'm-priya', attendees: ['m-priya', 'm-arjun'] })).status, 409, 'grown-ups only');
  assert.equal((await api('POST', '/api/meetups/meet-past/rsvp', { actor: 'm-priya', attendees: ['m-priya'] })).status, 409, 'already happened');
  assert.equal((await api('POST', '/api/meetups/meet-okafor/rsvp', { actor: 'm-priya', attendees: [] })).status, 400);
  const c = await api('POST', '/api/meetups/meet-okafor/cancel', { actor: 'm-priya' });
  assert.match(c.body.message, /2 seats freed/);
  const after = await api('GET', '/api/meetups?actor=m-priya');
  assert.equal(after.body.meetups.find((m) => m.id === 'meet-okafor').seatsLeft, 3);
});

test('R14 kid requests: ask, parent approves, seats booked', async () => {
  await reset();
  const ask = await api('POST', '/api/meetups/meet-bookclub/rsvp', { actor: 'm-arjun', attendees: ['m-arjun'] });
  assert.equal(ask.body.outcome, 'requested');
  assert.equal((await api('POST', '/api/meetups/meet-bookclub/rsvp', { actor: 'm-arjun', attendees: ['m-arjun', 'm-maya'] })).status, 403);
  const home = await api('GET', '/api/home?actor=m-priya');
  assert.equal(home.body.meetupRequests.length, 1);
  assert.equal((await api('POST', `/api/rsvps/${ask.body.rsvpId}`, { actor: 'm-arjun', decision: 'approve' })).status, 403);
  const ok = await api('POST', `/api/rsvps/${ask.body.rsvpId}`, { actor: 'm-priya', decision: 'approve' });
  assert.equal(ok.body.outcome, 'going');
  assert.deepEqual(ok.body.attendees, ['m-arjun', 'm-priya']);
  assert.equal((await api('POST', `/api/rsvps/${ask.body.rsvpId}`, { actor: 'm-priya', decision: 'approve' })).status, 409);
});

test('R14 calendar invite is a real .ics file', async () => {
  const r = await api('GET', '/api/meetups/meet-okafor/ics');
  assert.equal(r.status, 200);
  assert.match(r.type, /text\/calendar/);
  assert.match(r.headers.get('content-disposition') || '', /meet-okafor\.ics/);
  assert.match(r.body, /BEGIN:VEVENT/);
  assert.match(r.body, /DTSTART:20261115T183000Z/);
  assert.match(r.body, /LOCATION:Paper Lantern Books\\, 214 Alder Street\\, Maple County/);
});

test('digest uses reading sessions and shows streaks', async () => {
  await reset();
  const d = await api('GET', '/api/digest?actor=m-priya');
  const arjun = d.body.members.find((m) => m.memberId === 'm-arjun');
  assert.equal(arjun.minutes, 6 * 0 + 30 * 2 + 25 * 3, 'Oct 29, Oct 30 at 30 min + Oct 31 to Nov 2 at 25 min');
  assert.equal(arjun.streak, 8);
});

test('new actions are in the audit log', async () => {
  await reset();
  await api('POST', '/api/tbr', { actor: 'm-arjun', titleId: 't-owl' });
  await api('POST', '/api/sessions', { actor: 'm-arjun', borrowId: 'borrow-4', clientId: 'log-1', minutes: 6 });
  await api('POST', '/api/meetups/meet-okafor/rsvp', { actor: 'm-priya', attendees: ['m-arjun'] });
  const types = new Set((await api('GET', '/api/events?actor=m-priya')).body.events.map((e) => e.type));
  for (const t of ['list.added', 'reading.saved', 'meetup.rsvp']) assert.ok(types.has(t), `missing ${t}`);
});
