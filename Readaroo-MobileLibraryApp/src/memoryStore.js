/*
 * In-memory store and fake Stripe meter for offline mode, tests and the HTML demo.
 * Same interface as src/postgresStore.js. Works in Node and the browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReadarooMemory = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clone = (x) => JSON.parse(JSON.stringify(x));

  function createMemoryStore(seed) {
    let db;
    function load() {
      const s = clone(seed);
      db = {
        config: s.config, libraries: s.libraries, family: s.family, members: s.members, cards: s.cards,
        titles: s.titles, copies: s.copies, holds: s.holds, borrows: s.borrows, reactions: s.reactions,
        approvals: [], feedback: [], meterEvents: [], events: [], demoRecords: s.demoRecords || [],
        sessions: s.sessions || [], tbr: s.tbr || [], shelves: s.shelves || [], follows: s.follows || [],
        meetups: s.meetups || [], rsvps: [],
      };
    }
    load();
    const copy = (titleId, libraryId) => db.copies.find((c) => c.titleId === titleId && c.libraryId === libraryId);

    return {
      mode: 'offline',
      async getConfig() { return clone(db.config); },
      async getMember(id) { const m = db.members.find((x) => x.id === id); return m ? clone(m) : null; },
      async getFamily(id) {
        if (db.family.id !== id) return null;
        return { ...clone(db.family), members: clone(db.members.filter((m) => m.familyId === id)), cards: clone(db.cards.filter((c) => c.familyId === id)) };
      },
      async getTitle(id) { const t = db.titles.find((x) => x.id === id); return t ? clone(t) : null; },
      async listTitles() { return clone(db.titles); },
      async listCopies(titleId) { return clone(db.copies.filter((c) => !titleId || c.titleId === titleId)); },
      async listLibraries() { return clone(db.libraries); },
      async getLibrary(id) { const l = db.libraries.find((x) => x.id === id); return l ? clone(l) : null; },
      async listBorrows() { return clone(db.borrows); },
      async addBorrow(b) { db.borrows.push(clone(b)); },
      async updateBorrow(id, patch) { Object.assign(db.borrows.find((b) => b.id === id), patch); },
      async listHolds() { return clone(db.holds); },
      async addHold(h) { db.holds.push(clone(h)); },
      async listApprovals() { return clone(db.approvals); },
      async addApproval(a) { db.approvals.push(clone(a)); },
      async updateApproval(id, patch) { Object.assign(db.approvals.find((a) => a.id === id), patch); },
      async listReactions() { return clone(db.reactions); },
      async addReaction(r) { db.reactions.push(clone(r)); },
      async addFeedback(f) { db.feedback.push(clone(f)); },
      async addEvent(e) { db.events.push(clone(e)); },
      async listEvents() { return clone(db.events); },
      async listMeterEvents() { return clone(db.meterEvents); },
      async addMeterEvent(m) { if (!db.meterEvents.some((x) => x.idempotencyKey === m.idempotencyKey)) db.meterEvents.push(clone(m)); },
      async listDemoRecords() { return clone(db.demoRecords); },
      async takeCopy(titleId, libraryId) {
        const c = copy(titleId, libraryId);
        if (!c || c.available < 1) return false;
        c.available -= 1;
        return true;
      },
      async joinQueue(titleId, libraryId) {
        const c = copy(titleId, libraryId);
        c.queue += 1;
        return c.queue;
      },
      async touchCopy(titleId, libraryId, asOf) { copy(titleId, libraryId).asOf = asOf; },
      // Atomic in a single JS turn: check both caps, then spend.
      async reserveBudget(libraryId, cents, day) {
        const l = db.libraries.find((x) => x.id === libraryId);
        if (l.spentDay !== day) { l.spentDay = day; l.spentTodayCents = 0; }
        if (l.spentTodayCents + cents > l.dailyCapCents) return { ok: false, reason: 'daily cap reached' };
        if (l.spentMonthCents + cents > l.monthlyCapCents) return { ok: false, reason: 'monthly cap reached' };
        l.spentTodayCents += cents;
        l.spentMonthCents += cents;
        return { ok: true, remainingDailyCents: l.dailyCapCents - l.spentTodayCents, remainingMonthlyCents: l.monthlyCapCents - l.spentMonthCents };
      },
      async releaseBudget(libraryId, cents) {
        const l = db.libraries.find((x) => x.id === libraryId);
        l.spentTodayCents = Math.max(0, l.spentTodayCents - cents);
        l.spentMonthCents = Math.max(0, l.spentMonthCents - cents);
      },
      // ---- reading sessions (idempotent by clientId: a second save of the same session keeps the larger values)
      async listSessions() { return clone(db.sessions); },
      async saveSession(sess) {
        const existing = db.sessions.find((x) => x.clientId === sess.clientId);
        if (existing) {
          const added = Math.max(0, sess.minutes - existing.minutes);
          existing.minutes = Math.max(existing.minutes, sess.minutes);
          existing.toPage = Math.max(existing.toPage || 0, sess.toPage || 0);
          existing.at = sess.at;
          return { created: false, addedMinutes: added, session: clone(existing) };
        }
        db.sessions.push(clone(sess));
        return { created: true, addedMinutes: sess.minutes, session: clone(sess) };
      },
      // ---- want-to-read lists, shelves, follows
      async listTbr() { return clone(db.tbr); },
      async addTbr(row) {
        if (db.tbr.some((x) => x.memberId === row.memberId && x.titleId === row.titleId)) return false;
        db.tbr.push(clone(row));
        return true;
      },
      async removeTbr(memberId, titleId) {
        const before = db.tbr.length;
        db.tbr = db.tbr.filter((x) => !(x.memberId === memberId && x.titleId === titleId));
        return db.tbr.length < before;
      },
      async listShelves() { return clone(db.shelves); },
      async listFollows() { return clone(db.follows); },
      async addFollow(f) {
        if (db.follows.some((x) => x.memberId === f.memberId && x.kind === f.kind && x.value === f.value)) return false;
        db.follows.push(clone(f));
        return true;
      },
      async removeFollow(f) {
        const before = db.follows.length;
        db.follows = db.follows.filter((x) => !(x.memberId === f.memberId && x.kind === f.kind && x.value === f.value));
        return db.follows.length < before;
      },
      // ---- meetups and RSVPs
      async listMeetups() { return clone(db.meetups); },
      async getMeetup(id) { const m = db.meetups.find((x) => x.id === id); return m ? clone(m) : null; },
      async listRsvps() { return clone(db.rsvps); },
      async addRsvp(r) { db.rsvps.push(clone(r)); },
      async updateRsvp(id, patch) { Object.assign(db.rsvps.find((r) => r.id === id), patch); },
      // Atomic seat check: never more people than the room holds
      async takeSeats(meetupId, n) {
        const m = db.meetups.find((x) => x.id === meetupId);
        if (m.seatsTaken + n > m.capacity) return { ok: false, seatsLeft: m.capacity - m.seatsTaken };
        m.seatsTaken += n;
        return { ok: true, seatsLeft: m.capacity - m.seatsTaken };
      },
      async releaseSeats(meetupId, n) {
        const m = db.meetups.find((x) => x.id === meetupId);
        m.seatsTaken = Math.max(0, m.seatsTaken - n);
      },
      async reset() { load(); },
    };
  }

  // Fake Stripe meter: idempotent by key, never touches the network.
  function createFakeMeter() {
    const seen = new Map();
    return async function meter({ idempotencyKey }) {
      if (!seen.has(idempotencyKey)) seen.set(idempotencyKey, `mtr_fake_${(seen.size + 1).toString().padStart(4, '0')}`);
      return { id: seen.get(idempotencyKey), mode: 'simulated' };
    };
  }

  return { createMemoryStore, createFakeMeter };
});
