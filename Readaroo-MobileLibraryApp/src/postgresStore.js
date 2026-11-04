// Postgres store for live mode. Same interface as src/memoryStore.js.
'use strict';
const { Pool, types } = require('pg');
const path = require('path');
const fs = require('fs');

types.setTypeParser(1082, (v) => v); // date -> 'YYYY-MM-DD' string, no timezone shifts

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
function row(r) {
  if (!r) return null;
  const o = {};
  for (const [k, v] of Object.entries(r)) o[camel(k)] = v instanceof Date ? v.toISOString() : v;
  return o;
}
const rows = (res) => res.rows.map(row);

function createPostgresStore(connectionString) {
  const pool = new Pool({ connectionString, max: 5 });
  const q = (text, params) => pool.query(text, params);
  const demoRecords = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed.json'), 'utf8')).demoRecords;

  return {
    mode: 'live',
    pool,
    async ping() { await q('SELECT 1 FROM app_config LIMIT 1'); },
    async getConfig() {
      const r = await q('SELECT key, value FROM app_config');
      return Object.fromEntries(r.rows.map((x) => [x.key, x.value]));
    },
    async getMember(id) { return row((await q('SELECT * FROM members WHERE id = $1', [id])).rows[0]); },
    async getFamily(id) {
      const f = row((await q('SELECT * FROM families WHERE id = $1', [id])).rows[0]);
      if (!f) return null;
      f.members = rows(await q('SELECT * FROM members WHERE family_id = $1 ORDER BY role DESC, age DESC NULLS FIRST', [id]));
      f.cards = rows(await q('SELECT * FROM cards WHERE family_id = $1 ORDER BY id', [id]));
      return f;
    },
    async getTitle(id) { return row((await q('SELECT * FROM titles WHERE id = $1', [id])).rows[0]); },
    async listTitles() { return rows(await q('SELECT * FROM titles ORDER BY id')); },
    async listCopies(titleId) {
      return titleId
        ? rows(await q('SELECT * FROM copies WHERE title_id = $1 ORDER BY library_id', [titleId]))
        : rows(await q('SELECT * FROM copies ORDER BY title_id, library_id'));
    },
    async listLibraries() { return rows(await q('SELECT * FROM libraries ORDER BY id')); },
    async getLibrary(id) { return row((await q('SELECT * FROM libraries WHERE id = $1', [id])).rows[0]); },
    async listBorrows() { return rows(await q('SELECT * FROM borrows ORDER BY borrowed_at, id')); },
    async addBorrow(b) {
      await q(`INSERT INTO borrows (id, family_id, member_id, title_id, library_id, kind, borrowed_at, finished_at, minutes_read, cost_cents)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [b.id, b.familyId, b.memberId, b.titleId, b.libraryId, b.kind, b.borrowedAt, b.finishedAt, b.minutesRead, b.costCents]);
    },
    async updateBorrow(id, p) {
      await q(`UPDATE borrows SET finished_at = COALESCE($2, finished_at), minutes_read = COALESCE($3, minutes_read),
               current_page = COALESCE($4, current_page), last_read_at = COALESCE($5, last_read_at) WHERE id = $1`,
      [id, p.finishedAt || null, p.minutesRead ?? null, p.currentPage ?? null, p.lastReadAt || null]);
    },
    async listHolds() { return rows(await q('SELECT * FROM holds ORDER BY created_at, id')); },
    async addHold(h) {
      await q(`INSERT INTO holds (id, family_id, member_id, title_id, library_id, position, status, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [h.id, h.familyId, h.memberId, h.titleId, h.libraryId, h.position, h.status, h.createdAt]);
    },
    async listApprovals() { return rows(await q('SELECT * FROM approvals ORDER BY requested_at, id')); },
    async addApproval(a) {
      await q(`INSERT INTO approvals (id, family_id, member_id, title_id, reason, status, scope, requested_at, decided_at, decided_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [a.id, a.familyId, a.memberId, a.titleId, a.reason, a.status, a.scope, a.requestedAt, a.decidedAt, a.decidedBy]);
    },
    async updateApproval(id, p) {
      await q('UPDATE approvals SET status = $2, scope = COALESCE($3, scope), decided_at = $4, decided_by = $5 WHERE id = $1',
        [id, p.status, p.scope || null, p.decidedAt, p.decidedBy]);
    },
    async listReactions() { return rows(await q('SELECT * FROM reactions ORDER BY at, id')); },
    async addReaction(r) {
      await q('INSERT INTO reactions (id, borrow_id, member_id, reaction, at) VALUES ($1,$2,$3,$4,$5)', [r.id, r.borrowId, r.memberId, r.reaction, r.at]);
    },
    async addFeedback(f) {
      await q('INSERT INTO feedback (id, member_id, held_title_id, suggested_title_id, vote, at) VALUES ($1,$2,$3,$4,$5,$6)',
        [f.id, f.memberId, f.heldTitleId, f.suggestedTitleId, f.vote, f.at]);
    },
    async addEvent(e) {
      await q('INSERT INTO events (id, family_id, actor, type, data, at) VALUES ($1,$2,$3,$4,$5,$6)',
        [e.id, e.familyId, e.actor, e.type, JSON.stringify(e.data || {}), e.at]);
    },
    async listEvents() { return rows(await q('SELECT id, family_id, actor, type, data, at FROM events ORDER BY seq')); },
    async listMeterEvents() { return rows(await q('SELECT * FROM meter_events ORDER BY at, idempotency_key')); },
    async addMeterEvent(m) {
      await q(`INSERT INTO meter_events (idempotency_key, library_id, value_cents, stripe_id, mode, at) VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (idempotency_key) DO NOTHING`, [m.idempotencyKey, m.libraryId, m.valueCents, m.stripeId, m.mode, m.at]);
    },
    async listDemoRecords() { return demoRecords; },
    async takeCopy(titleId, libraryId) {
      const r = await q('UPDATE copies SET available = available - 1 WHERE title_id = $1 AND library_id = $2 AND available > 0 RETURNING available', [titleId, libraryId]);
      return r.rowCount === 1;
    },
    async joinQueue(titleId, libraryId) {
      const r = await q('UPDATE copies SET queue = queue + 1 WHERE title_id = $1 AND library_id = $2 RETURNING queue', [titleId, libraryId]);
      return r.rows[0].queue;
    },
    async touchCopy(titleId, libraryId, asOf) {
      await q('UPDATE copies SET as_of = $3 WHERE title_id = $1 AND library_id = $2', [titleId, libraryId, asOf]);
    },
    // Locks the library row so two requests can never both spend the last of a cap.
    async reserveBudget(libraryId, cents, day) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const l = row((await client.query('SELECT * FROM libraries WHERE id = $1 FOR UPDATE', [libraryId])).rows[0]);
        const today = l.spentDay === day ? l.spentTodayCents : 0;
        let result;
        if (today + cents > l.dailyCapCents) result = { ok: false, reason: 'daily cap reached' };
        else if (l.spentMonthCents + cents > l.monthlyCapCents) result = { ok: false, reason: 'monthly cap reached' };
        else {
          await client.query('UPDATE libraries SET spent_day = $2, spent_today_cents = $3, spent_month_cents = spent_month_cents + $4 WHERE id = $1',
            [libraryId, day, today + cents, cents]);
          result = { ok: true, remainingDailyCents: l.dailyCapCents - today - cents, remainingMonthlyCents: l.monthlyCapCents - l.spentMonthCents - cents };
        }
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async releaseBudget(libraryId, cents) {
      await q(`UPDATE libraries SET spent_today_cents = GREATEST(0, spent_today_cents - $2), spent_month_cents = GREATEST(0, spent_month_cents - $2) WHERE id = $1`, [libraryId, cents]);
    },
    // ---- reading sessions (idempotent by client_id)
    async listSessions() { return rows(await q('SELECT * FROM sessions ORDER BY day, at, id')); },
    async saveSession(x) {
      const prev = row((await q('SELECT * FROM sessions WHERE client_id = $1', [x.clientId])).rows[0]);
      const r = await q(`INSERT INTO sessions (id, client_id, borrow_id, member_id, day, minutes, to_page, at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT (client_id) DO UPDATE SET minutes = GREATEST(sessions.minutes, EXCLUDED.minutes),
                 to_page = GREATEST(COALESCE(sessions.to_page, 0), COALESCE(EXCLUDED.to_page, 0)), at = EXCLUDED.at
               RETURNING *`, [x.id, x.clientId, x.borrowId, x.memberId, x.day, x.minutes, x.toPage, x.at]);
      const session = row(r.rows[0]);
      return { created: !prev, addedMinutes: prev ? Math.max(0, session.minutes - prev.minutes) : session.minutes, session };
    },
    // ---- want-to-read lists, shelves, follows
    async listTbr() { return rows(await q('SELECT * FROM tbr ORDER BY added_at, title_id')); },
    async addTbr(t) {
      const r = await q(`INSERT INTO tbr (member_id, title_id, added_by, source, added_at) VALUES ($1,$2,$3,$4,$5)
                         ON CONFLICT DO NOTHING`, [t.memberId, t.titleId, t.addedBy, t.source, t.addedAt]);
      return r.rowCount === 1;
    },
    async removeTbr(memberId, titleId) {
      return (await q('DELETE FROM tbr WHERE member_id = $1 AND title_id = $2', [memberId, titleId])).rowCount === 1;
    },
    async listShelves() {
      const shelves = rows(await q('SELECT * FROM shelves ORDER BY min_age, id'));
      const links = rows(await q('SELECT * FROM shelf_titles ORDER BY shelf_id, position'));
      return shelves.map((sh) => ({ ...sh, titleIds: links.filter((l) => l.shelfId === sh.id).map((l) => l.titleId) }));
    },
    async listFollows() { return rows(await q('SELECT * FROM follows ORDER BY member_id, kind, value')); },
    async addFollow(f) {
      return (await q('INSERT INTO follows (member_id, kind, value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [f.memberId, f.kind, f.value])).rowCount === 1;
    },
    async removeFollow(f) {
      return (await q('DELETE FROM follows WHERE member_id = $1 AND kind = $2 AND value = $3', [f.memberId, f.kind, f.value])).rowCount === 1;
    },
    // ---- meetups and RSVPs
    async listMeetups() { return rows(await q('SELECT * FROM meetups ORDER BY starts_at, id')); },
    async getMeetup(id) { return row((await q('SELECT * FROM meetups WHERE id = $1', [id])).rows[0]); },
    async listRsvps() { return rows(await q('SELECT * FROM rsvps ORDER BY created_at, id')); },
    async addRsvp(r) {
      await q(`INSERT INTO rsvps (id, meetup_id, family_id, attendees, status, requested_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [r.id, r.meetupId, r.familyId, r.attendees, r.status, r.requestedBy, r.createdAt]);
    },
    async updateRsvp(id, p) {
      await q('UPDATE rsvps SET status = COALESCE($2, status), attendees = COALESCE($3, attendees) WHERE id = $1',
        [id, p.status || null, p.attendees || null]);
    },
    // Single conditional UPDATE: two families can never take the last seat twice
    async takeSeats(meetupId, n) {
      const r = await q(`UPDATE meetups SET seats_taken = seats_taken + $2 WHERE id = $1 AND seats_taken + $2 <= capacity
                         RETURNING capacity - seats_taken AS left`, [meetupId, n]);
      if (r.rowCount === 1) return { ok: true, seatsLeft: r.rows[0].left };
      const m = row((await q('SELECT capacity - seats_taken AS left FROM meetups WHERE id = $1', [meetupId])).rows[0]);
      return { ok: false, seatsLeft: m ? m.left : 0 };
    },
    async releaseSeats(meetupId, n) {
      await q('UPDATE meetups SET seats_taken = GREATEST(0, seats_taken - $2) WHERE id = $1', [meetupId, n]);
    },
    async close() { await pool.end(); },
  };
}

module.exports = { createPostgresStore };
