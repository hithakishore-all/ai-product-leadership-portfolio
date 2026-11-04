/*
 * Readaroo engine: every product rule lives here.
 * Works in Node (require) and in the browser (window.ReadarooEngine), so the
 * server, the tests and the offline HTML demo all run the same code.
 *
 * createEngine({ store, meter }) returns { handle(method, path, body, query) }.
 *   store  an object with the async methods listed in docs/ARCHITECTURE.md
 *   meter  async ({ libraryId, customerId, valueCents, idempotencyKey }) => { id, mode }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReadarooEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class HttpError extends Error {
    constructor(status, message, extra) {
      super(message);
      this.status = status;
      this.extra = extra || {};
    }
  }

  const DAY_MS = 86400000;

  function createEngine({ store, meter }) {
    let counter = 0;
    const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${(++counter).toString(36)}`;

    async function cfg() {
      const c = await store.getConfig();
      return {
        now: c.now,
        nowMs: Date.parse(c.now),
        today: c.now.slice(0, 10),
        threshold: Number(c.instantWaitThresholdDays),
        staleHours: Number(c.staleHours),
        daysPerTurn: Number(c.daysPerQueueTurn),
        streakMin: Number(c.streakMinMinutes || 5),
        weeklyGoal: Number(c.weeklyGoalDays || 5),
        secondsPerMinute: Number(c.readingSecondsPerMinute || 60),
        newArrivalDays: Number(c.newArrivalDays || 30),
      };
    }

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function prettyDate(iso) {
      return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
    }
    function dayShift(day, n) {
      return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
    }

    // ---------- helpers ----------
    function levelKnown(t) {
      return t.minAge !== null && t.minAge !== undefined && t.maxAge !== null && t.maxAge !== undefined;
    }
    function inBand(member, t) {
      if (member.role === 'parent') return true;
      if (!levelKnown(t)) return false;
      return t.minAge <= member.bandMax && t.maxAge >= member.bandMin;
    }
    function levelLabel(t) {
      if (!levelKnown(t)) return 'Level unknown';
      if (t.minAge >= 18) return 'Adult';
      return `Ages ${t.minAge}–${t.maxAge}`;
    }
    function isFresh(copy, c) {
      return c.nowMs - Date.parse(copy.asOf) <= c.staleHours * 3600000;
    }
    function waitDays(owned, position, c) {
      if (owned <= 0) return null;
      return Math.ceil(position / owned) * c.daysPerTurn;
    }
    // Wait for an existing hold; for an unreleased title, count from release day using copies on order
    function holdWaitDays(t, cp, position, c) {
      if (t.releaseDate && t.releaseDate > c.today) {
        if (!cp.onOrder) return null;
        const until = Math.round((Date.parse(t.releaseDate) - Date.parse(c.today)) / DAY_MS);
        return until + Math.ceil(position / cp.onOrder) * c.daysPerTurn;
      }
      return waitDays(cp.owned, position, c);
    }
    function waitLabel(days) {
      if (days === null) return 'Not owned';
      if (days <= 7) return 'About a week';
      const lo = Math.max(1, Math.round((days * 0.6) / 7));
      const hi = Math.max(lo + 1, Math.round(days / 7));
      return `${lo}–${hi} weeks`;
    }
    function familyLibraryIds(fam) {
      return fam.cards.map((c) => c.libraryId);
    }
    async function loadFamilyFor(actorId) {
      if (!actorId || typeof actorId !== 'string') throw new HttpError(400, 'Missing "actor": the member making the request.');
      const actor = await store.getMember(actorId);
      if (!actor) throw new HttpError(404, `No family member with id "${actorId}".`);
      const fam = await store.getFamily(actor.familyId);
      return { actor, fam };
    }
    function memberIn(fam, memberId) {
      const m = fam.members.find((x) => x.id === memberId);
      if (!m) throw new HttpError(404, `No member "${memberId}" in this family.`);
      return m;
    }
    function assertCanActFor(actor, member) {
      if (actor.role === 'parent') return;
      if (actor.id !== member.id) throw new HttpError(403, 'Kids can only borrow or place holds for themselves.');
    }
    async function title(id) {
      if (!id || typeof id !== 'string') throw new HttpError(400, 'Missing "titleId".');
      const t = await store.getTitle(id);
      if (!t) throw new HttpError(404, `No title "${id}".`);
      return t;
    }
    async function log(familyId, actor, type, data) {
      const c = await cfg();
      await store.addEvent({ id: newId('evt'), familyId, actor, type, data: data || {}, at: c.now });
    }

    // Availability for one title across the family's libraries
    async function availability(t, fam, c) {
      const libs = familyLibraryIds(fam);
      const copies = (await store.listCopies(t.id)).filter((cp) => libs.includes(cp.libraryId));
      const libraries = await store.listLibraries();
      const unreleased = t.releaseDate && t.releaseDate > c.today;
      return copies.map((cp) => {
        const lib = libraries.find((l) => l.id === cp.libraryId);
        if (unreleased) {
          const untilRelease = Math.max(0, Math.round((Date.parse(t.releaseDate) - Date.parse(c.today)) / DAY_MS));
          const days = cp.onOrder > 0 ? untilRelease + Math.ceil((cp.queue + 1) / cp.onOrder) * c.daysPerTurn : null;
          return {
            libraryId: cp.libraryId, libraryName: lib ? lib.name : cp.libraryId, owned: cp.owned, onOrder: cp.onOrder || 0,
            available: 0, status: 'coming', statusLabel: `Out ${prettyDate(t.releaseDate)}`, asOf: cp.asOf,
            newHoldWaitDays: days, newHoldWaitLabel: days === null ? 'Not ordered' : `${waitLabel(days - untilRelease)} after ${prettyDate(t.releaseDate)}`,
            ppuCents: null,
          };
        }
        const fresh = isFresh(cp, c);
        const days = waitDays(cp.owned, cp.queue + 1, c);
        return {
          libraryId: cp.libraryId,
          libraryName: lib ? lib.name : cp.libraryId,
          owned: cp.owned,
          onOrder: cp.onOrder || 0,
          available: fresh ? cp.available : null,
          status: !fresh ? 'check' : cp.available > 0 ? 'available' : 'waitlist',
          statusLabel: !fresh ? 'Check availability' : cp.available > 0 ? 'Available now' : `${cp.queue} waiting`,
          asOf: cp.asOf,
          newHoldWaitDays: cp.available > 0 && fresh ? 0 : days,
          newHoldWaitLabel: cp.available > 0 && fresh ? 'Now' : waitLabel(days),
          ppuCents: cp.ppuCents,
        };
      });
    }

    async function activeBorrow(memberId, titleId) {
      return (await store.listBorrows()).find((b) => b.memberId === memberId && b.titleId === titleId && !b.finishedAt) || null;
    }
    async function assertNotAlreadyBorrowed(member, t) {
      if (await activeBorrow(member.id, t.id)) {
        throw new HttpError(409, `${member.name} already has ${t.title} checked out.`, { code: 'already_borrowed' });
      }
    }

    async function borrowedTitleIds(memberId) {
      const bs = await store.listBorrows();
      return new Set(bs.filter((b) => b.memberId === memberId).map((b) => b.titleId));
    }

    // ---------- Next-Up ----------
    async function nextUp(held, member, fam, c) {
      const read = await borrowedTitleIds(member.id);
      const all = await store.listTitles();
      const scored = [];
      const excluded = [];
      for (const t of all) {
        if (t.id === held.id || read.has(t.id)) continue;
        if (!levelKnown(t)) { excluded.push({ titleId: t.id, title: t.title, reason: 'Reading level unknown' }); continue; }
        if (!inBand(member, t)) continue;
        if (member.role === 'parent' && t.minAge < 18 && held.minAge >= 18) continue;
        const av = await availability(t, fam, c);
        const ready = av.filter((a) => a.status === 'available');
        if (!ready.length) {
          if (av.some((a) => a.status === 'check')) excluded.push({ titleId: t.id, title: t.title, reason: 'Availability out of date' });
          continue;
        }
        const reasons = [];
        let score = 0;
        if (held.series && t.series === held.series) { score += 3; reasons.push('same series'); }
        if (t.author === held.author) { score += 2; reasons.push(`also by ${t.author}`); }
        const shared = (t.themes || []).filter((x) => (held.themes || []).includes(x));
        if (shared.length) { score += shared.length; reasons.push(shared.join(', ')); }
        if (!score) continue;
        scored.push({
          titleId: t.id, title: t.title, author: t.author, color: t.color, level: levelLabel(t), score,
          why: reasons.join(' · '),
          libraryId: ready[0].libraryId, libraryName: ready[0].libraryName,
        });
      }
      scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
      return { suggestions: scored.slice(0, 3), excluded };
    }

    // ---------- views ----------
    async function titleDetail(q) {
      const { actor, fam } = await loadFamilyFor(q.actor);
      const member = memberIn(fam, q.member || q.actor);
      const t = await title(q.id);
      const c = await cfg();
      const av = await availability(t, fam, c);
      const holds = (await store.listHolds()).filter((h) => h.memberId === member.id && h.titleId === t.id && h.status === 'waiting');
      const hold = holds[0] || null;
      const anyAvailable = av.some((a) => a.status === 'available');
      let instant = instantEligibility(t, av, c);
      if (instant.eligible) {
        const lib = await store.getLibrary(instant.libraryId);
        const today = lib.spentDay === c.now.slice(0, 10) ? lib.spentTodayCents : 0;
        if (today + instant.priceCents > lib.dailyCapCents || lib.spentMonthCents + instant.priceCents > lib.monthlyCapCents) {
          instant = { eligible: false, capReached: true, reason: `${lib.name}'s instant-borrow budget is used up for now, so we won't offer one. Place a hold or pick a Next-Up book.` };
        }
      }
      const pending = (await store.listApprovals()).find((a) => a.memberId === member.id && a.titleId === t.id && a.status === 'pending');
      const active = await activeBorrow(member.id, t.id);
      let next = null;
      if (!anyAvailable && !active) next = await nextUp(t, member, fam, c);
      let holdInfo = null;
      if (hold) {
        const cp = (await store.listCopies(t.id)).find((x) => x.libraryId === hold.libraryId);
        const days = holdWaitDays(t, cp, hold.position, c);
        const lib = await store.getLibrary(hold.libraryId);
        holdInfo = { id: hold.id, libraryName: lib.name, position: hold.position, waitDays: days, waitLabel: waitLabel(days) };
      }
      return {
        title: { ...t, level: levelLabel(t), levelKnown: levelKnown(t) },
        member: { id: member.id, name: member.name, role: member.role },
        inBand: inBand(member, t),
        needsApproval: member.role === 'kid' && actor.role !== 'parent' && !inBand(member, t),
        pendingApprovalId: pending ? pending.id : null,
        borrowed: active ? { id: active.id, kind: active.kind } : null,
        onList: (await store.listTbr()).some((x) => x.memberId === member.id && x.titleId === t.id),
        followingSeries: Boolean(t.series) && (await store.listFollows()).some((f) => f.memberId === member.id && f.kind === 'series' && f.value === t.series),
        availability: av,
        hold: holdInfo,
        instant,
        nextUp: next,
      };
    }

    function instantEligibility(t, av, c) {
      if (!t.seriesNo || t.seriesNo < 2) return { eligible: false, reason: 'Instant borrows are for series continuations only.' };
      const anyReady = av.some((a) => a.status === 'available');
      if (anyReady) return { eligible: false, reason: 'A copy is available now.' };
      const rights = av.filter((a) => a.ppuCents !== null && a.ppuCents !== undefined);
      if (!rights.length) return { eligible: false, reason: 'No pay-per-use rights for this title at your libraries.' };
      const best = rights.slice().sort((a, b) => (a.newHoldWaitDays || 0) - (b.newHoldWaitDays || 0))[0];
      if ((best.newHoldWaitDays || 0) < c.threshold) return { eligible: false, reason: `Wait is under ${c.threshold} days.` };
      return { eligible: true, libraryId: best.libraryId, libraryName: best.libraryName, priceCents: best.ppuCents, waitLabel: best.newHoldWaitLabel };
    }

    async function home(q) {
      const { fam } = await loadFamilyFor(q.actor);
      const c = await cfg();
      const titles = await store.listTitles();
      const tById = Object.fromEntries(titles.map((t) => [t.id, t]));
      const borrows = (await store.listBorrows()).filter((b) => b.familyId === fam.id);
      const holds = (await store.listHolds()).filter((h) => h.familyId === fam.id && h.status === 'waiting');
      const approvals = (await store.listApprovals()).filter((a) => a.familyId === fam.id);
      const libraries = await store.listLibraries();
      const holdRows = [];
      for (const h of holds) {
        const cp = (await store.listCopies(h.titleId)).find((x) => x.libraryId === h.libraryId);
        const days = holdWaitDays(tById[h.titleId], cp, h.position, c);
        holdRows.push({
          id: h.id, memberId: h.memberId, titleId: h.titleId, title: tById[h.titleId].title, color: tById[h.titleId].color,
          libraryName: (libraries.find((l) => l.id === h.libraryId) || {}).name, position: h.position, waitLabel: waitLabel(days),
        });
      }
      return {
        now: c.now,
        family: { id: fam.id, name: fam.name },
        members: fam.members,
        cards: fam.cards.map((cd) => ({ ...cd, libraryName: (libraries.find((l) => l.id === cd.libraryId) || {}).name })),
        reading: borrows.filter((b) => !b.finishedAt).map((b) => ({
          id: b.id, memberId: b.memberId, titleId: b.titleId, title: tById[b.titleId].title, color: tById[b.titleId].color, kind: b.kind,
          currentPage: b.currentPage || 0, pages: tById[b.titleId].pages, pct: Math.round(((b.currentPage || 0) / tById[b.titleId].pages) * 100),
          lastReadAt: b.lastReadAt,
        })),
        streaks: await Promise.all(fam.members.map(async (m) => {
          const s = await streakFor(m, c);
          return { memberId: m.id, current: s.current, readToday: s.readToday, minutesNeeded: s.minutesNeeded, weekDays: s.weekDays, weeklyGoal: s.weeklyGoal, message: s.message };
        })),
        listReady: await listReadyCounts(fam, c),
        meetupRequests: await meetupRequests(fam),
        nextMeetup: await nextMeetupFor(fam, c),
        holds: holdRows,
        pendingApprovals: approvals.filter((a) => a.status === 'pending').map((a) => ({
          id: a.id, memberId: a.memberId, titleId: a.titleId, title: tById[a.titleId].title, reason: a.reason, requestedAt: a.requestedAt,
        })),
      };
    }

    async function listReadyCounts(fam, c) {
      const out = {};
      const tbr = await store.listTbr();
      for (const m of fam.members) {
        let n = 0;
        for (const x of tbr.filter((y) => y.memberId === m.id)) {
          const t = await store.getTitle(x.titleId);
          if ((await availability(t, fam, c)).some((a) => a.status === 'available')) n++;
        }
        out[m.id] = n;
      }
      return out;
    }
    async function meetupRequests(fam) {
      const meets = Object.fromEntries((await store.listMeetups()).map((m) => [m.id, m]));
      return (await store.listRsvps()).filter((r) => r.familyId === fam.id && r.status === 'requested')
        .map((r) => ({ id: r.id, meetupId: r.meetupId, title: meets[r.meetupId].title, startsAt: meets[r.meetupId].startsAt, by: r.requestedBy }));
    }
    async function nextMeetupFor(fam, c) {
      const links = await familyReadingLinks(fam);
      const all = (await store.listMeetups()).filter((m) => Date.parse(m.startsAt) > c.nowMs);
      const rows = [];
      for (const m of all) rows.push(await meetupRow(m, fam, links, c, fam.members[0]));
      const pick = rows.filter((r) => r.forYou && r.availability !== 'full').sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      return pick ? { id: pick.id, title: pick.title, startsAt: pick.startsAt, venue: pick.venue, why: pick.why, seatsLeft: pick.seatsLeft } : null;
    }

    async function search(q) {
      const { fam } = await loadFamilyFor(q.actor);
      const member = memberIn(fam, q.member || q.actor);
      const c = await cfg();
      const term = String(q.q || '').trim().toLowerCase();
      const titles = await store.listTitles();
      const out = [];
      for (const t of titles) {
        if (term && !(`${t.title} ${t.author} ${t.series || ''}`.toLowerCase().includes(term))) continue;
        if (member.role === 'kid' && levelKnown(t) && t.minAge >= 18) continue;
        const av = await availability(t, fam, c);
        out.push({
          id: t.id, title: t.title, author: t.author, color: t.color, level: levelLabel(t), inBand: inBand(member, t),
          status: av.some((a) => a.status === 'available') ? 'available' : av.some((a) => a.status === 'check') ? 'check' : 'waitlist',
        });
      }
      return { member: member.id, results: out };
    }

    // ---------- actions ----------
    async function requireApprovalIfNeeded(actor, member, t, fam) {
      // A parent acting for their kid is the approver, so only kid-initiated requests are gated.
      if (member.role !== 'kid' || actor.role === 'parent' || inBand(member, t)) return null;
      const existing = (await store.listApprovals()).find((a) => a.memberId === member.id && a.titleId === t.id && a.status === 'approved');
      if (existing) return null;
      const pending = (await store.listApprovals()).find((a) => a.memberId === member.id && a.titleId === t.id && a.status === 'pending');
      if (pending) return { outcome: 'approval_pending', approvalId: pending.id, message: `Waiting for a parent to approve ${t.title}.` };
      const c = await cfg();
      const reason = levelKnown(t)
        ? `${levelLabel(t)} is outside ${member.name}'s band (${member.bandMin}–${member.bandMax}).`
        : 'Reading level is unknown.';
      const approval = {
        id: newId('appr'), familyId: fam.id, memberId: member.id, titleId: t.id, reason, status: 'pending',
        scope: null, requestedAt: c.now, decidedAt: null, decidedBy: null,
      };
      await store.addApproval(approval);
      await log(fam.id, actor.id, 'approval.requested', { approvalId: approval.id, titleId: t.id, memberId: member.id, reason });
      return { outcome: 'approval_required', approvalId: approval.id, message: `Asked a parent to approve ${t.title}. ${reason}` };
    }

    async function borrow(body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      const member = memberIn(fam, body.member || body.actor);
      assertCanActFor(actor, member);
      const t = await title(body.titleId);
      const gate = await requireApprovalIfNeeded(actor, member, t, fam);
      if (gate) return gate;
      return doStandardBorrow(actor, member, t, fam, body.libraryId);
    }

    async function doStandardBorrow(actor, member, t, fam, preferredLibraryId) {
      await assertNotAlreadyBorrowed(member, t);
      const c = await cfg();
      const av = await availability(t, fam, c);
      const ready = av.filter((a) => a.status === 'available' && (!preferredLibraryId || a.libraryId === preferredLibraryId));
      if (!ready.length) {
        if (av.some((a) => a.status === 'check')) {
          throw new HttpError(409, 'Availability is out of date. Refresh it from the library before borrowing.', { code: 'stale' });
        }
        throw new HttpError(409, `No copy of ${t.title} is available. Place a hold or pick a Next-Up book.`, { code: 'unavailable' });
      }
      const lib = ready[0];
      const ok = await store.takeCopy(t.id, lib.libraryId);
      if (!ok) throw new HttpError(409, 'That copy was just borrowed by someone else. Try again.', { code: 'race' });
      const b = {
        id: newId('borrow'), familyId: fam.id, memberId: member.id, titleId: t.id, libraryId: lib.libraryId,
        kind: 'standard', borrowedAt: c.now, finishedAt: null, minutesRead: 0, costCents: 0,
      };
      await store.addBorrow(b);
      await log(fam.id, actor.id, 'borrow.created', { borrowId: b.id, titleId: t.id, memberId: member.id, libraryId: lib.libraryId, kind: 'standard' });
      return { outcome: 'borrowed', borrowId: b.id, message: `${member.name} borrowed ${t.title} from ${lib.libraryName}. Due in 21 days.` };
    }

    async function placeHold(actor, member, t, fam) {
      const c = await cfg();
      const existing = (await store.listHolds()).find((h) => h.memberId === member.id && h.titleId === t.id && h.status === 'waiting');
      if (existing) {
        const lib = await store.getLibrary(existing.libraryId);
        return { outcome: 'already_on_hold', holdId: existing.id, libraryName: lib.name, position: existing.position, message: `Already on hold at ${lib.name}.` };
      }
      const av = (await availability(t, fam, c)).filter((a) => a.owned > 0 || a.onOrder > 0);
      if (!av.length) throw new HttpError(409, `None of your libraries own ${t.title}.`, { code: 'not_owned' });
      av.sort((a, b) => (a.newHoldWaitDays || 0) - (b.newHoldWaitDays || 0));
      const best = av[0];
      const position = await store.joinQueue(t.id, best.libraryId);
      const h = { id: newId('hold'), familyId: fam.id, memberId: member.id, titleId: t.id, libraryId: best.libraryId, position, status: 'waiting', createdAt: c.now };
      await store.addHold(h);
      const compared = av.map((a) => ({ libraryName: a.libraryName, waitLabel: a.newHoldWaitLabel }));
      await log(fam.id, actor.id, 'hold.placed', { holdId: h.id, titleId: t.id, memberId: member.id, libraryId: best.libraryId, position, compared });
      return {
        outcome: 'hold_placed', holdId: h.id, libraryName: best.libraryName, position, waitLabel: best.newHoldWaitLabel, compared,
        message: `Hold placed at ${best.libraryName}, the shortest line (#${position}, ${best.newHoldWaitLabel}).`,
      };
    }

    async function hold(body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      const member = memberIn(fam, body.member || body.actor);
      assertCanActFor(actor, member);
      const t = await title(body.titleId);
      const gate = await requireApprovalIfNeeded(actor, member, t, fam);
      if (gate) return gate;
      return placeHold(actor, member, t, fam);
    }

    async function instant(body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      const member = memberIn(fam, body.member || body.actor);
      assertCanActFor(actor, member);
      const t = await title(body.titleId);
      const gate = await requireApprovalIfNeeded(actor, member, t, fam);
      if (gate) return gate;
      await assertNotAlreadyBorrowed(member, t);
      const c = await cfg();
      const av = await availability(t, fam, c);
      const elig = instantEligibility(t, av, c);
      if (!elig.eligible) throw new HttpError(409, `Instant borrow not offered: ${elig.reason}`, { code: 'not_eligible' });

      const borrowId = newId('borrow');
      const key = `borrow:${borrowId}`;
      const reserve = await store.reserveBudget(elig.libraryId, elig.priceCents, c.now.slice(0, 10));
      if (!reserve.ok) {
        await log(fam.id, actor.id, 'instant.refused', { titleId: t.id, memberId: member.id, libraryId: elig.libraryId, reason: reserve.reason, priceCents: elig.priceCents });
        const fallback = await placeHold(actor, member, t, fam);
        const next = await nextUp(t, member, fam, c);
        return {
          outcome: 'instant_refused', reason: reserve.reason, charged: false, hold: fallback, nextUp: next,
          message: `${elig.libraryName} can't fund an instant borrow right now (${reserve.reason}). Nothing was charged. ${fallback.message}`,
        };
      }
      const lib = await store.getLibrary(elig.libraryId);
      let metered;
      try {
        metered = await meter({ libraryId: lib.id, customerId: lib.stripeCustomerId, valueCents: elig.priceCents, idempotencyKey: key });
      } catch (err) {
        await store.releaseBudget(elig.libraryId, elig.priceCents);
        await log(fam.id, actor.id, 'instant.meter_failed', { titleId: t.id, libraryId: lib.id, error: String(err && err.message || err) });
        throw new HttpError(502, 'Could not record the charge with Stripe, so the borrow was cancelled. Nothing was charged.', { code: 'meter_failed' });
      }
      await store.addMeterEvent({ idempotencyKey: key, libraryId: lib.id, valueCents: elig.priceCents, stripeId: metered.id, mode: metered.mode, at: c.now });
      const b = {
        id: borrowId, familyId: fam.id, memberId: member.id, titleId: t.id, libraryId: lib.id,
        kind: 'instant', borrowedAt: c.now, finishedAt: null, minutesRead: 0, costCents: elig.priceCents,
      };
      await store.addBorrow(b);
      await log(fam.id, actor.id, 'instant.borrowed', { borrowId, titleId: t.id, memberId: member.id, libraryId: lib.id, priceCents: elig.priceCents, meterId: metered.id, mode: metered.mode });
      return {
        outcome: 'instant_borrowed', borrowId, charged: true, priceCents: elig.priceCents, meterId: metered.id, mode: metered.mode,
        remainingDailyCents: reserve.remainingDailyCents, remainingMonthlyCents: reserve.remainingMonthlyCents,
        message: `${lib.name} funded an instant borrow of ${t.title} ($${(elig.priceCents / 100).toFixed(2)}, ${metered.mode}).`,
      };
    }

    async function decide(id, body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      if (actor.role !== 'parent') throw new HttpError(403, 'Only a parent can approve or decline requests.');
      const decision = body.decision;
      if (!['approve', 'approve_series', 'decline'].includes(decision)) throw new HttpError(400, '"decision" must be approve, approve_series or decline.');
      const a = (await store.listApprovals()).find((x) => x.id === id && x.familyId === fam.id);
      if (!a) throw new HttpError(404, `No approval "${id}".`);
      if (a.status !== 'pending') throw new HttpError(409, `This request was already ${a.status}.`, { code: 'already_decided' });
      const c = await cfg();
      const t = await store.getTitle(a.titleId);
      const member = memberIn(fam, a.memberId);
      if (decision === 'decline') {
        await store.updateApproval(id, { status: 'declined', decidedAt: c.now, decidedBy: actor.id });
        await log(fam.id, actor.id, 'approval.declined', { approvalId: id, titleId: t.id });
        const alt = await nextUp(t, member, fam, c);
        return { outcome: 'declined', alternatives: alt.suggestions, message: `Declined. Suggested ${alt.suggestions.length} books in ${member.name}'s band instead.` };
      }
      const scope = decision === 'approve_series' && t.series ? 'series' : 'title';
      await store.updateApproval(id, { status: 'approved', scope, decidedAt: c.now, decidedBy: actor.id });
      if (scope === 'series') {
        const siblings = (await store.listTitles()).filter((x) => x.series === t.series && x.id !== t.id);
        for (const s of siblings) {
          await store.addApproval({ id: newId('appr'), familyId: fam.id, memberId: member.id, titleId: s.id, reason: `Series approved with ${t.title}`, status: 'approved', scope: 'series', requestedAt: c.now, decidedAt: c.now, decidedBy: actor.id });
        }
      }
      await log(fam.id, actor.id, 'approval.approved', { approvalId: id, titleId: t.id, scope });
      // Fulfil the request: borrow if a fresh copy is ready, otherwise hold.
      const av = await availability(t, fam, c);
      const result = av.some((x) => x.status === 'available')
        ? await doStandardBorrow(actor, member, t, fam)
        : await placeHold(actor, member, t, fam);
      return { outcome: 'approved', scope, fulfilment: result, message: `Approved. ${result.message}` };
    }

    async function react(body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      if (!['loved', 'ok', 'not_for_me'].includes(body.reaction)) throw new HttpError(400, '"reaction" must be loved, ok or not_for_me.');
      const b = (await store.listBorrows()).find((x) => x.id === body.borrowId && x.familyId === fam.id);
      if (!b) throw new HttpError(404, `No borrow "${body.borrowId}".`);
      if (actor.role === 'kid' && b.memberId !== actor.id) throw new HttpError(403, 'Kids can only react to their own books.');
      const c = await cfg();
      if (!b.finishedAt) await store.updateBorrow(b.id, { finishedAt: c.now, minutesRead: b.minutesRead || 0 });
      const r = { id: newId('react'), borrowId: b.id, memberId: b.memberId, reaction: body.reaction, at: c.now };
      await store.addReaction(r);
      await log(fam.id, actor.id, 'reaction.added', { borrowId: b.id, reaction: body.reaction });
      return { outcome: 'reacted', message: 'Saved. A parent will see this in the weekly digest.' };
    }

    async function feedback(body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      if (!['up', 'down'].includes(body.vote)) throw new HttpError(400, '"vote" must be up or down.');
      await title(body.heldTitleId);
      await title(body.suggestedTitleId);
      const c = await cfg();
      await store.addFeedback({ id: newId('fb'), memberId: actor.id, heldTitleId: body.heldTitleId, suggestedTitleId: body.suggestedTitleId, vote: body.vote, at: c.now });
      await log(fam.id, actor.id, 'nextup.feedback', { heldTitleId: body.heldTitleId, suggestedTitleId: body.suggestedTitleId, vote: body.vote });
      return { outcome: 'recorded', message: 'Thanks. This tunes future suggestions.' };
    }

    async function refresh(body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      const t = await title(body.titleId);
      const c = await cfg();
      const copies = (await store.listCopies(t.id)).filter((cp) => familyLibraryIds(fam).includes(cp.libraryId));
      for (const cp of copies) await store.touchCopy(t.id, cp.libraryId, c.now);
      await log(fam.id, actor.id, 'availability.refreshed', { titleId: t.id, libraries: copies.map((x) => x.libraryId) });
      return { outcome: 'refreshed', message: `Checked ${copies.length} library catalog${copies.length === 1 ? '' : 's'} (simulated sync).` };
    }

    async function digest(q) {
      const { actor, fam } = await loadFamilyFor(q.actor);
      if (actor.role !== 'parent') throw new HttpError(403, 'Only parents see the family digest.');
      const c = await cfg();
      const since = c.nowMs - 7 * DAY_MS;
      const titles = Object.fromEntries((await store.listTitles()).map((t) => [t.id, t]));
      const borrows = (await store.listBorrows()).filter((b) => b.familyId === fam.id);
      const reactions = await store.listReactions();
      const events = (await store.listEvents()).filter((e) => e.familyId === fam.id && Date.parse(e.at) >= since);
      const finished = borrows.filter((b) => b.finishedAt && Date.parse(b.finishedAt) >= since);
      const sinceDay = dayShift(c.today, -6);
      const sessions = (await store.listSessions()).filter((x) => x.day >= sinceDay && x.day <= c.today);
      const streaks = {};
      for (const m of fam.members) streaks[m.id] = await streakFor(m, c);
      const perMember = fam.members.map((m) => {
        const mine = finished.filter((b) => b.memberId === m.id);
        return {
          memberId: m.id, name: m.name, role: m.role,
          booksFinished: mine.length,
          minutes: sessions.filter((x) => x.memberId === m.id).reduce((s, x) => s + x.minutes, 0),
          daysRead: streaks[m.id].weekDays, streak: streaks[m.id].current, streakMessage: streaks[m.id].message,
          books: mine.map((b) => {
            const r = reactions.filter((x) => x.borrowId === b.id).slice(-1)[0];
            const t = titles[b.titleId];
            return { title: t.title, reaction: r ? r.reaction : null, prompt: conversationPrompt(t) };
          }),
        };
      });
      const instantCount = events.filter((e) => e.type === 'instant.borrowed').length;
      const nextUpBorrows = events.filter((e) => e.type === 'borrow.created').length;
      return {
        weekEnding: c.now.slice(0, 10),
        totals: {
          booksFinished: finished.length,
          minutes: sessions.reduce((s, x) => s + x.minutes, 0),
          instantBorrows: instantCount,
          borrowsThisWeek: nextUpBorrows + instantCount,
        },
        members: perMember,
      };
    }

    function conversationPrompt(t) {
      const th = (t.themes || [])[0];
      const prompts = {
        animals: `Which animal in ${t.title} would you want as a friend, and why?`,
        quest: `What was the bravest choice in ${t.title}?`,
        rain: `What would you do on a rainy day like in ${t.title}?`,
        space: `If you could visit one place from ${t.title}, where would you go?`,
        family: `What did ${t.title} make you think about?`,
      };
      return prompts[th] || `What was your favorite part of ${t.title}?`;
    }

    async function library() {
      const c = await cfg();
      const libs = await store.listLibraries();
      const meters = await store.listMeterEvents();
      const events = await store.listEvents();
      return {
        today: c.now.slice(0, 10),
        libraries: libs.map((l) => {
          const today = l.spentDay === c.now.slice(0, 10) ? l.spentTodayCents : 0;
          return {
            id: l.id, name: l.name, dailyCapCents: l.dailyCapCents, spentTodayCents: today, monthlyCapCents: l.monthlyCapCents,
            spentMonthCents: l.spentMonthCents, stripeConnected: Boolean(l.stripeCustomerId),
            meterEvents: meters.filter((m) => m.libraryId === l.id),
            refusals: events.filter((e) => e.type === 'instant.refused' && e.data.libraryId === l.id).length,
          };
        }),
      };
    }

    async function eventsView(q) {
      const { fam } = await loadFamilyFor(q.actor);
      const evts = (await store.listEvents()).filter((e) => e.familyId === fam.id);
      return { events: evts.slice(-50).reverse() };
    }

    // =====================================================================
    // v1.1: reading tracker, streaks, lists, picks, releases, meetups
    // =====================================================================
    const BAND_LABEL = (m) => (m.role === 'kid' ? `${m.bandMin}\u2013${m.bandMax}` : 'grown-ups');

    // ---------- streaks ----------
    async function minutesByDay(memberId) {
      const by = {};
      for (const s of await store.listSessions()) if (s.memberId === memberId) by[s.day] = (by[s.day] || 0) + s.minutes;
      return by;
    }
    // Walk back from `anchor`. Each reading day counts. One missed day in any 7 is a rest day and
    // doesn't break the streak; a second miss inside 7 days ends it. Today is never a miss (it isn't over).
    function streakEnding(by, anchor, c, todayOpen) {
      let count = 0;
      let lastRest = null;
      let pendingRest = null;
      const restDays = [];
      for (let d = 0; d < 400; d++) {
        const day = dayShift(anchor, -d);
        if ((by[day] || 0) >= c.streakMin) {
          count++;
          if (pendingRest !== null) { restDays.push(pendingRest); pendingRest = null; }
          continue;
        }
        if (d === 0 && todayOpen) continue;
        if (count > 0 && pendingRest === null && (lastRest === null || d - lastRest >= 7)) {
          pendingRest = day;
          lastRest = d;
          continue;
        }
        if (count === 0 && d <= 1 && todayOpen && pendingRest === null) { pendingRest = day; lastRest = d; continue; }
        break;
      }
      return { count, restDays };
    }
    async function streakFor(member, c) {
      const by = await minutesByDay(member.id);
      const cur = streakEnding(by, c.today, c, true);
      let longest = cur.count;
      for (const day of Object.keys(by)) {
        if (by[day] >= c.streakMin) longest = Math.max(longest, streakEnding(by, day, c, false).count);
      }
      const minutesToday = by[c.today] || 0;
      const readToday = minutesToday >= c.streakMin;
      const need = Math.max(0, c.streakMin - minutesToday);
      let weekDays = 0;
      for (let d = 0; d < 7; d++) if ((by[dayShift(c.today, -d)] || 0) >= c.streakMin) weekDays++;
      const calendar = [];
      for (let d = 13; d >= 0; d--) {
        const day = dayShift(c.today, -d);
        calendar.push({ day, minutes: by[day] || 0, read: (by[day] || 0) >= c.streakMin, rest: cur.restDays.includes(day), today: d === 0 });
      }
      const finished = (await store.listBorrows()).filter((b) => b.memberId === member.id && b.finishedAt).length;
      const badges = [];
      if (finished >= 1) badges.push('First book');
      for (const n of [5, 10, 25]) if (finished >= n) badges.push(`${n} books`);
      for (const n of [3, 7, 14, 30]) if (longest >= n) badges.push(`${n}-day streak`);
      let message;
      if (cur.count > 0 && readToday) message = `${cur.count}-day streak. You read today. Nice.`;
      else if (cur.count > 0) message = `${cur.count}-day streak. Read ${need} minute${need === 1 ? '' : 's'} today to make it ${cur.count + 1}.`;
      else if (longest > 0) message = `Fresh start: read ${c.streakMin} minutes today to begin a new streak. Your best is ${longest} days.`;
      else message = `Read ${c.streakMin} minutes today to start a streak.`;
      return {
        current: cur.count, longest, readToday, minutesToday, minutesNeeded: need, restDays: cur.restDays,
        weekDays, weeklyGoal: c.weeklyGoal, calendar, badges, booksFinished: finished, message,
      };
    }

    // ---------- reading tracker ----------
    async function familyBorrow(fam, actor, borrowId) {
      if (!borrowId || typeof borrowId !== 'string') throw new HttpError(400, 'Missing "borrowId".');
      const b = (await store.listBorrows()).find((x) => x.id === borrowId && x.familyId === fam.id);
      if (!b) throw new HttpError(404, `No borrow "${borrowId}" in this family.`);
      if (actor.role === 'kid' && b.memberId !== actor.id) throw new HttpError(403, 'Kids can only open their own books.');
      return b;
    }
    async function readerView(borrowId, q) {
      const { actor, fam } = await loadFamilyFor(q.actor);
      const b = await familyBorrow(fam, actor, borrowId);
      const t = await store.getTitle(b.titleId);
      const c = await cfg();
      const member = memberIn(fam, b.memberId);
      return {
        borrowId: b.id, finished: Boolean(b.finishedAt),
        title: { id: t.id, title: t.title, author: t.author, color: t.color, pages: t.pages },
        member: { id: member.id, name: member.name, role: member.role },
        currentPage: b.currentPage || 0, pages: t.pages, pct: Math.round(((b.currentPage || 0) / t.pages) * 100),
        lastReadAt: b.lastReadAt, minutesRead: b.minutesRead || 0,
        secondsPerMinute: c.secondsPerMinute,
        streak: await streakFor(member, c),
      };
    }
    async function saveSession(body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      const b = await familyBorrow(fam, actor, body.borrowId);
      const clientId = body.clientId;
      if (typeof clientId !== 'string' || clientId.length < 4 || clientId.length > 80) throw new HttpError(400, '"clientId" must be a string of 4 to 80 characters.');
      const minutes = Number(body.minutes);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) throw new HttpError(400, '"minutes" must be a whole number from 1 to 600.');
      const t = await store.getTitle(b.titleId);
      const toPage = body.toPage === undefined || body.toPage === null ? (b.currentPage || 0) : Number(body.toPage);
      if (!Number.isInteger(toPage) || toPage < 0 || toPage > t.pages) throw new HttpError(400, `"toPage" must be between 0 and ${t.pages}.`);
      if (b.finishedAt) throw new HttpError(409, `${t.title} is already finished.`, { code: 'already_finished' });
      const c = await cfg();
      const member = memberIn(fam, b.memberId);
      const res = await store.saveSession({
        id: newId('sess'), clientId, borrowId: b.id, memberId: b.memberId, day: c.today, minutes, toPage, at: c.now,
      });
      const page = Math.max(b.currentPage || 0, toPage);
      const finished = page >= t.pages;
      await store.updateBorrow(b.id, {
        minutesRead: (b.minutesRead || 0) + res.addedMinutes, currentPage: page, lastReadAt: c.now, finishedAt: finished ? c.now : null,
      });
      if (res.created || res.addedMinutes > 0) {
        await log(fam.id, actor.id, 'reading.saved', { borrowId: b.id, titleId: t.id, memberId: member.id, minutes: res.addedMinutes, toPage: page, retry: !res.created });
      }
      if (finished) await log(fam.id, actor.id, 'reading.finished', { borrowId: b.id, titleId: t.id, memberId: member.id });
      const streak = await streakFor(member, c);
      return {
        outcome: finished ? 'finished' : 'saved', currentPage: page, pages: t.pages, pct: Math.round((page / t.pages) * 100),
        finished, savedMinutes: res.addedMinutes, duplicate: !res.created, streak,
        message: finished
          ? `${member.name} finished ${t.title}! ${streak.message}`
          : `Saved at page ${page} of ${t.pages}. ${streak.message}`,
      };
    }

    // ---------- shared title row ----------
    async function titleRow(t, member, fam, c, extra) {
      const av = await availability(t, fam, c);
      const status = av.some((a) => a.status === 'available') ? 'available'
        : av.some((a) => a.status === 'coming') ? 'coming'
          : av.some((a) => a.status === 'check') ? 'check' : av.length ? 'waitlist' : 'none';
      return {
        id: t.id, title: t.title, author: t.author, color: t.color, level: levelLabel(t), series: t.series, seriesNo: t.seriesNo,
        releaseDate: t.releaseDate, status, statusLabel: status === 'coming' ? `Out ${prettyDate(t.releaseDate)}` : null,
        inBand: inBand(member, t), needsOk: member.role === 'kid' && !inBand(member, t),
        rating: t.ratingPct && t.ratingCount >= 20 ? { pct: t.ratingPct, count: t.ratingCount } : null,
        ...(extra || {}),
      };
    }
    function kidMayList(member, t) {
      return !(member.role === 'kid' && levelKnown(t) && t.minAge >= 18);
    }

    // ---------- want-to-read lists by age group ----------
    async function lists(q) {
      const { actor, fam } = await loadFamilyFor(q.actor);
      const member = memberIn(fam, q.member || q.actor);
      if (actor.role === 'kid' && member.id !== actor.id) throw new HttpError(403, 'Kids can only see their own list.');
      const c = await cfg();
      const titles = Object.fromEntries((await store.listTitles()).map((t) => [t.id, t]));
      const tbr = (await store.listTbr()).filter((x) => x.memberId === member.id);
      const onList = new Set(tbr.map((x) => x.titleId));
      const rows = [];
      for (const x of tbr) {
        rows.push(await titleRow(titles[x.titleId], member, fam, c, { addedBy: nameIn(fam, x.addedBy), source: x.source, addedAt: x.addedAt }));
      }
      const order = { available: 0, check: 1, waitlist: 2, coming: 3, none: 4 };
      rows.sort((a, b) => order[a.status] - order[b.status] || a.title.localeCompare(b.title));
      const kids = fam.members.filter((m) => m.role === 'kid');
      const shelves = [];
      for (const sh of await store.listShelves()) {
        const forWhom = sh.minAge >= 18 ? fam.members.filter((m) => m.role === 'parent').map((m) => m.name)
          : kids.filter((k) => sh.minAge <= k.bandMax && sh.maxAge >= k.bandMin).map((k) => k.name);
        const fitsBand = member.role !== 'kid' || (sh.minAge <= member.bandMax && sh.maxAge >= member.bandMin);
        // Kids also see the next age group up, so they can reach for it with a grown-up's OK
        const stretch = member.role === 'kid' && !fitsBand && sh.minAge === member.bandMax + 1;
        if (member.role === 'kid' && !fitsBand && !stretch) continue;
        const items = [];
        for (const id of sh.titleIds) {
          const t = titles[id];
          if (!t || !kidMayList(member, t)) continue;
          items.push(await titleRow(t, member, fam, c, { onList: onList.has(id) }));
        }
        shelves.push({ id: sh.id, name: sh.name, minAge: sh.minAge, maxAge: sh.maxAge, curator: sh.curator, forWhom, items, stretch: Boolean(stretch) });
      }
      // A kid's own age group first
      if (member.role === 'kid') shelves.sort((a, b) => Math.abs(a.minAge - member.bandMin) - Math.abs(b.minAge - member.bandMin));
      return {
        member: { id: member.id, name: member.name, role: member.role, band: BAND_LABEL(member) },
        list: rows, readyCount: rows.filter((r) => r.status === 'available').length, shelves,
      };
    }
    function nameIn(fam, id) {
      const m = fam.members.find((x) => x.id === id);
      return m ? m.name : id;
    }
    async function addToList(body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      const member = memberIn(fam, body.member || body.actor);
      if (actor.role === 'kid' && member.id !== actor.id) throw new HttpError(403, 'Kids can only change their own list.');
      const t = await title(body.titleId);
      if (!kidMayList(member, t)) throw new HttpError(403, `${t.title} is on the grown-ups shelf.`);
      const c = await cfg();
      const added = await store.addTbr({ memberId: member.id, titleId: t.id, addedBy: actor.id, source: actor.id === member.id ? 'self' : 'parent', addedAt: c.now });
      if (!added) return { outcome: 'already_listed', message: `${t.title} is already on ${member.name}'s list.` };
      await log(fam.id, actor.id, 'list.added', { titleId: t.id, memberId: member.id });
      const note = member.role === 'kid' && !inBand(member, t) ? ' Borrowing it will need a grown-up\u2019s OK.' : '';
      return { outcome: 'listed', message: `Added ${t.title} to ${actor.id === member.id ? 'your' : `${member.name}'s`} list.${note}` };
    }
    async function removeFromList(body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      const member = memberIn(fam, body.member || body.actor);
      if (actor.role === 'kid' && member.id !== actor.id) throw new HttpError(403, 'Kids can only change their own list.');
      const t = await title(body.titleId);
      const removed = await store.removeTbr(member.id, t.id);
      if (!removed) throw new HttpError(404, `${t.title} isn't on that list.`);
      await log(fam.id, actor.id, 'list.removed', { titleId: t.id, memberId: member.id });
      return { outcome: 'removed', message: `Removed ${t.title}.` };
    }

    // ---------- good picks, new releases, follows ----------
    async function recommend(member, fam, c) {
      const titles = await store.listTitles();
      const tById = Object.fromEntries(titles.map((t) => [t.id, t]));
      const borrows = (await store.listBorrows()).filter((b) => b.memberId === member.id);
      const reactions = await store.listReactions();
      const latest = {};
      for (const r of reactions) latest[r.borrowId] = r.reaction;
      const read = new Set(borrows.map((b) => b.titleId));
      const finished = borrows.filter((b) => b.finishedAt).map((b) => tById[b.titleId]);
      const loved = borrows.filter((b) => latest[b.id] === 'loved').map((b) => tById[b.titleId]);
      const disliked = borrows.filter((b) => latest[b.id] === 'not_for_me').map((b) => tById[b.titleId]);
      const listed = new Set((await store.listTbr()).filter((x) => x.memberId === member.id).map((x) => x.titleId));
      const follows = (await store.listFollows()).filter((f) => f.memberId === member.id);
      const holds = new Set((await store.listHolds()).filter((h) => h.memberId === member.id && h.status === 'waiting').map((h) => h.titleId));
      const out = [];
      for (const t of titles) {
        if (read.has(t.id) || !levelKnown(t)) continue;
        if (t.releaseDate > c.today) continue;
        if (member.role === 'kid' ? !inBand(member, t) : t.minAge < 18) continue;
        let score = 0;
        const why = [];
        const prev = finished.find((f) => f.series && f.series === t.series && f.seriesNo === t.seriesNo - 1);
        if (prev) { score += 5; why.push(`Next in ${t.series} after ${prev.title}`); }
        const byLovedAuthor = loved.find((l) => l.author === t.author);
        if (byLovedAuthor && !prev) { score += 3; why.push(`More by ${t.author}, who wrote ${byLovedAuthor.title}`); }
        for (const l of loved) {
          const shared = (t.themes || []).filter((x) => (l.themes || []).includes(x));
          if (shared.length && !prev && !byLovedAuthor) { score += shared.length; why.push(`Like ${l.title}: ${shared.join(', ')}`); break; }
          if (shared.length) score += shared.length;
        }
        for (const d of disliked) score -= (t.themes || []).filter((x) => (d.themes || []).includes(x)).length;
        if (follows.some((f) => (f.kind === 'series' && f.value === t.series) || (f.kind === 'author' && f.value === t.author))) {
          score += 2; why.push(`You follow ${t.series || t.author}`);
        }
        if (t.ratingPct >= 85 && t.ratingCount >= 20) { score += 1; why.push(`Loved by ${t.ratingPct}% of readers ${BAND_LABEL(member)}`); }
        if (listed.has(t.id)) { score += 1; why.push('On your list'); }
        if (score <= 0) continue;
        out.push(await titleRow(t, member, fam, c, { score, why, onList: listed.has(t.id), onHold: holds.has(t.id) }));
      }
      out.sort((a, b) => b.score - a.score || (a.status === 'available' ? -1 : 0) - (b.status === 'available' ? -1 : 0) || a.title.localeCompare(b.title));
      return out.slice(0, 6);
    }
    async function discover(q) {
      const { actor, fam } = await loadFamilyFor(q.actor);
      const member = memberIn(fam, q.member || q.actor);
      if (actor.role === 'kid' && member.id !== actor.id) throw new HttpError(403, 'Kids can only see their own picks.');
      const c = await cfg();
      const titles = await store.listTitles();
      const follows = (await store.listFollows()).filter((f) => f.memberId === member.id);
      const holds = new Set((await store.listHolds()).filter((h) => h.memberId === member.id && h.status === 'waiting').map((h) => h.titleId));
      const libs = familyLibraryIds(fam);
      const copies = await store.listCopies();
      const atLibs = (t) => copies.some((cp) => cp.titleId === t.id && libs.includes(cp.libraryId));
      const fits = (t) => (member.role === 'kid' ? kidMayList(member, t) && (inBand(member, t) || !levelKnown(t)) : true);
      const isFollowed = (t) => follows.some((f) => (f.kind === 'series' && f.value === t.series) || (f.kind === 'author' && f.value === t.author));
      const since = dayShift(c.today, -c.newArrivalDays);
      const newArrivals = [];
      for (const t of titles.filter((x) => x.releaseDate <= c.today && x.releaseDate >= since && atLibs(x) && fits(x)).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))) {
        newArrivals.push(await titleRow(t, member, fam, c, { followed: isFollowed(t), released: prettyDate(t.releaseDate) }));
      }
      const comingSoon = [];
      for (const t of titles.filter((x) => x.releaseDate > c.today && atLibs(x) && fits(x))) {
        comingSoon.push(await titleRow(t, member, fam, c, { followed: isFollowed(t), onHold: holds.has(t.id) }));
      }
      comingSoon.sort((a, b) => Number(b.followed) - Number(a.followed) || a.releaseDate.localeCompare(b.releaseDate));
      return {
        member: { id: member.id, name: member.name, role: member.role, band: BAND_LABEL(member) },
        picks: await recommend(member, fam, c), newArrivals, comingSoon, follows,
      };
    }
    async function follow(body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      const member = memberIn(fam, body.member || body.actor);
      if (actor.role === 'kid' && member.id !== actor.id) throw new HttpError(403, 'Kids can only follow for themselves.');
      if (!['author', 'series'].includes(body.kind)) throw new HttpError(400, '"kind" must be author or series.');
      const titles = await store.listTitles();
      if (!titles.some((t) => (body.kind === 'author' ? t.author : t.series) === body.value)) throw new HttpError(404, `No ${body.kind} called "${body.value}".`);
      const f = { memberId: member.id, kind: body.kind, value: body.value };
      if (body.on === false) {
        await store.removeFollow(f);
        await log(fam.id, actor.id, 'follow.removed', f);
        return { outcome: 'unfollowed', message: `Stopped following ${body.value}.` };
      }
      await store.addFollow(f);
      await log(fam.id, actor.id, 'follow.added', f);
      return { outcome: 'followed', message: `Following ${body.value}. New books show up first in Discover.` };
    }

    // ---------- author talks and meetups ----------
    async function familyReadingLinks(fam) {
      const titles = Object.fromEntries((await store.listTitles()).map((t) => [t.id, t]));
      const ids = new Set(fam.members.map((m) => m.id));
      const borrows = (await store.listBorrows()).filter((b) => ids.has(b.memberId));
      const reactions = await store.listReactions();
      const loved = new Set(reactions.filter((r) => r.reaction === 'loved').map((r) => r.borrowId));
      const links = [];
      for (const b of borrows) links.push({ memberId: b.memberId, title: titles[b.titleId], loved: loved.has(b.id), how: loved.has(b.id) ? 'loved' : b.finishedAt ? 'read' : 'is reading' });
      for (const x of await store.listTbr()) if (ids.has(x.memberId)) links.push({ memberId: x.memberId, title: titles[x.titleId], how: 'wants to read' });
      for (const f of await store.listFollows()) if (ids.has(f.memberId)) links.push({ memberId: f.memberId, follow: f, how: 'follows' });
      return links;
    }
    function ageFits(m, meet) {
      if (m.role === 'parent') return meet.maxAge >= 18 || meet.minAge < 13;
      return m.age >= meet.minAge && m.age <= meet.maxAge;
    }
    async function meetupRow(meet, fam, links, c, viewer) {
      const why = [];
      for (const l of links) {
        const name = nameIn(fam, l.memberId);
        if (l.follow && ((l.follow.kind === 'author' && l.follow.value === meet.author) || (l.follow.kind === 'series' && l.follow.value === meet.series))) why.push(`${name} follows ${l.follow.value}`);
        else if (l.title && ((meet.author && l.title.author === meet.author) || (meet.series && l.title.series === meet.series))) why.push(`${name} ${l.how} ${l.title.title}`);
      }
      const uniqueWhy = [...new Set(why)].sort((a, b) => (b.includes(' loved ') ? 1 : 0) - (a.includes(' loved ') ? 1 : 0)).slice(0, 2);
      const rsvps = (await store.listRsvps()).filter((r) => r.meetupId === meet.id && r.familyId === fam.id && r.status !== 'cancelled');
      const mine = rsvps.find((r) => r.status === 'going' || r.status === 'waitlist') || null;
      const requests = rsvps.filter((r) => r.status === 'requested');
      const left = meet.capacity - meet.seatsTaken;
      return {
        id: meet.id, title: meet.title, kind: meet.kind, author: meet.author, venue: meet.venue, venueKind: meet.venueKind, address: meet.address,
        startsAt: meet.startsAt, endsAt: meet.endsAt, minAge: meet.minAge, maxAge: meet.maxAge,
        ages: meet.maxAge >= 99 ? `${meet.minAge}+` : `Ages ${meet.minAge}\u2013${meet.maxAge}`,
        priceLabel: meet.priceCents ? `$${(meet.priceCents / 100).toFixed(2)}` : 'Free',
        description: meet.description, seatsLeft: left, availability: left <= 0 ? 'full' : left <= 5 ? 'few' : 'open',
        goodFor: fam.members.filter((m) => ageFits(m, meet) && (m.role === 'kid' || meet.maxAge >= 18)).map((m) => m.name),
        why: uniqueWhy, forYou: uniqueWhy.length > 0,
        needsAdult: meet.minAge < 13,
        rsvp: mine ? { id: mine.id, status: mine.status, attendees: mine.attendees.map((id) => nameIn(fam, id)) } : null,
        requests: requests.map((r) => ({ id: r.id, by: nameIn(fam, r.requestedBy) })),
        viewerRequested: requests.some((r) => r.requestedBy === viewer.id),
      };
    }
    async function meetups(q) {
      const { actor, fam } = await loadFamilyFor(q.actor);
      const c = await cfg();
      const links = await familyReadingLinks(fam);
      const all = (await store.listMeetups()).filter((m) => Date.parse(m.startsAt) > c.nowMs);
      const visible = actor.role === 'kid' ? all.filter((m) => ageFits(actor, m)) : all;
      const rows = [];
      for (const m of visible) rows.push(await meetupRow(m, fam, links, c, actor));
      rows.sort((a, b) => Number(b.forYou) - Number(a.forYou) || a.startsAt.localeCompare(b.startsAt));
      return { meetups: rows };
    }
    async function upcomingMeetup(id, c) {
      const m = await store.getMeetup(id);
      if (!m) throw new HttpError(404, `No event "${id}".`);
      if (Date.parse(m.startsAt) <= c.nowMs) throw new HttpError(409, 'That event already happened.', { code: 'past' });
      return m;
    }
    async function bookSeats(actor, fam, meet, attendeeIds, c, existingRequest) {
      const members = attendeeIds.map((id) => memberIn(fam, id));
      for (const m of members) {
        if (m.role === 'kid' && !ageFits(m, meet)) {
          throw new HttpError(409, `${m.name} (${m.age}) is outside this event's ages (${meet.minAge}\u2013${meet.maxAge}).`, { code: 'age' });
        }
      }
      if (meet.minAge >= 18 && members.some((m) => m.role === 'kid')) throw new HttpError(409, 'This event is for grown-ups only.', { code: 'age' });
      // Kids under 13 go with a grown-up: add the parent who is booking
      let addedAdult = false;
      if (members.some((m) => m.role === 'kid' && m.age < 13) && !members.some((m) => m.role === 'parent')) {
        attendeeIds = [...attendeeIds, actor.id];
        addedAdult = true;
      }
      const active = (await store.listRsvps()).find((r) => r.meetupId === meet.id && r.familyId === fam.id && (r.status === 'going' || r.status === 'waitlist'));
      if (active) throw new HttpError(409, `Your family is already ${active.status === 'going' ? 'going' : 'on the waitlist'}. Cancel first to change who's coming.`, { code: 'already_rsvped' });
      const seats = await store.takeSeats(meet.id, attendeeIds.length);
      const status = seats.ok ? 'going' : 'waitlist';
      let id;
      if (existingRequest) {
        id = existingRequest.id;
        await store.updateRsvp(id, { status, attendees: attendeeIds });
      } else {
        id = newId('rsvp');
        await store.addRsvp({ id, meetupId: meet.id, familyId: fam.id, attendees: attendeeIds, status, requestedBy: actor.id, createdAt: c.now });
      }
      await log(fam.id, actor.id, 'meetup.rsvp', { meetupId: meet.id, status, attendees: attendeeIds });
      const names = attendeeIds.map((x) => nameIn(fam, x)).join(', ');
      return {
        outcome: status, rsvpId: id, attendees: attendeeIds, seatsLeft: seats.seatsLeft, addedAdult,
        message: status === 'going'
          ? `You're going to ${meet.title}: ${names}.${addedAdult ? ' Kids under 13 come with a grown-up, so you were added.' : ''} ${seats.seatsLeft} seat${seats.seatsLeft === 1 ? '' : 's'} left.`
          : `${meet.title} is full, so ${names} ${attendeeIds.length === 1 ? 'is' : 'are'} on the waitlist. No seats were taken.`,
      };
    }
    async function rsvp(id, body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      const c = await cfg();
      const meet = await upcomingMeetup(id, c);
      let attendees = body.attendees;
      if (!Array.isArray(attendees) || !attendees.length || attendees.some((x) => typeof x !== 'string')) {
        throw new HttpError(400, '"attendees" must be a list of family member ids.');
      }
      attendees = [...new Set(attendees)];
      attendees.forEach((x) => memberIn(fam, x));
      if (actor.role === 'kid') {
        if (attendees.length !== 1 || attendees[0] !== actor.id) throw new HttpError(403, 'Kids can ask to go themselves; a grown-up books the seats.');
        if (!ageFits(actor, meet)) throw new HttpError(409, `This event is for ages ${meet.minAge}\u2013${meet.maxAge}.`, { code: 'age' });
        const dup = (await store.listRsvps()).find((r) => r.meetupId === meet.id && r.familyId === fam.id && r.requestedBy === actor.id && r.status === 'requested');
        if (dup) return { outcome: 'requested', rsvpId: dup.id, message: 'You already asked. A grown-up will see it in Approvals.' };
        const rid = newId('rsvp');
        await store.addRsvp({ id: rid, meetupId: meet.id, familyId: fam.id, attendees: [actor.id], status: 'requested', requestedBy: actor.id, createdAt: c.now });
        await log(fam.id, actor.id, 'meetup.requested', { meetupId: meet.id });
        return { outcome: 'requested', rsvpId: rid, message: `Asked a grown-up to take you to ${meet.title}.` };
      }
      return bookSeats(actor, fam, meet, attendees, c, null);
    }
    async function decideRsvp(id, body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      if (actor.role !== 'parent') throw new HttpError(403, 'Only a parent can answer event requests.');
      if (!['approve', 'decline'].includes(body.decision)) throw new HttpError(400, '"decision" must be approve or decline.');
      const r = (await store.listRsvps()).find((x) => x.id === id && x.familyId === fam.id);
      if (!r) throw new HttpError(404, `No event request "${id}".`);
      if (r.status !== 'requested') throw new HttpError(409, 'That request was already answered.', { code: 'already_decided' });
      const c = await cfg();
      const meet = await upcomingMeetup(r.meetupId, c);
      if (body.decision === 'decline') {
        await store.updateRsvp(id, { status: 'cancelled' });
        await log(fam.id, actor.id, 'meetup.declined', { meetupId: meet.id, rsvpId: id });
        return { outcome: 'declined', message: 'Declined. No seats were booked.' };
      }
      return bookSeats(actor, fam, meet, [r.requestedBy], c, r);
    }
    async function cancelRsvp(id, body) {
      const { actor, fam } = await loadFamilyFor(body.actor);
      if (actor.role !== 'parent') throw new HttpError(403, 'Only a parent can cancel a booking.');
      const c = await cfg();
      const meet = await upcomingMeetup(id, c);
      const r = (await store.listRsvps()).find((x) => x.meetupId === meet.id && x.familyId === fam.id && (x.status === 'going' || x.status === 'waitlist'));
      if (!r) throw new HttpError(404, 'Your family has no booking for this event.');
      await store.updateRsvp(r.id, { status: 'cancelled' });
      if (r.status === 'going') await store.releaseSeats(meet.id, r.attendees.length);
      await log(fam.id, actor.id, 'meetup.cancelled', { meetupId: meet.id, released: r.status === 'going' ? r.attendees.length : 0 });
      return { outcome: 'cancelled', message: r.status === 'going' ? `Cancelled. ${r.attendees.length} seat${r.attendees.length === 1 ? '' : 's'} freed for other families.` : 'Left the waitlist.' };
    }
    async function meetupIcs(id) {
      const m = await store.getMeetup(id);
      if (!m) throw new HttpError(404, `No event "${id}".`);
      const c = await cfg();
      const stamp = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d+/, '').slice(0, 15) + 'Z';
      const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
      const text = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Readaroo//Prototype//EN', 'BEGIN:VEVENT',
        `UID:${m.id}@readaroo.example`, `DTSTAMP:${stamp(c.now)}`, `DTSTART:${stamp(m.startsAt)}`, `DTEND:${stamp(m.endsAt)}`,
        `SUMMARY:${esc(m.title)}`, `LOCATION:${esc(`${m.venue}, ${m.address}`)}`, `DESCRIPTION:${esc(`${m.description} (Synthetic Readaroo demo event.)`)}`,
        'END:VEVENT', 'END:VCALENDAR', '',
      ].join('\r\n');
      return { __raw: text, contentType: 'text/calendar; charset=utf-8', filename: `${m.id}.ics` };
    }

    async function streaksView(q) {
      const { actor, fam } = await loadFamilyFor(q.actor);
      const c = await cfg();
      const people = actor.role === 'kid' ? [actor] : fam.members;
      const out = [];
      for (const m of people) out.push({ memberId: m.id, name: m.name, role: m.role, ...(await streakFor(m, c)) });
      return { streaks: out };
    }

    // ---------- router ----------
    async function route(method, path, body, query) {
      const m = method.toUpperCase();
      const seg = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
      if (m === 'GET' && seg[0] === 'health') return { ok: true, service: 'readaroo' };
      if (m === 'GET' && seg[0] === 'demo-records') return { records: await store.listDemoRecords() };
      if (m === 'GET' && seg[0] === 'home') return home(query);
      if (m === 'GET' && seg[0] === 'titles' && !seg[1]) return search(query);
      if (m === 'GET' && seg[0] === 'titles' && seg[1]) return titleDetail({ ...query, id: seg[1] });
      if (m === 'POST' && seg[0] === 'borrow') return borrow(body);
      if (m === 'POST' && seg[0] === 'holds') return hold(body);
      if (m === 'POST' && seg[0] === 'instant') return instant(body);
      if (m === 'POST' && seg[0] === 'approvals' && seg[1]) return decide(seg[1], body);
      if (m === 'POST' && seg[0] === 'reactions') return react(body);
      if (m === 'POST' && seg[0] === 'feedback') return feedback(body);
      if (m === 'POST' && seg[0] === 'refresh') return refresh(body);
      if (m === 'GET' && seg[0] === 'digest') return digest(query);
      if (m === 'GET' && seg[0] === 'library') return library();
      if (m === 'GET' && seg[0] === 'events') return eventsView(query);
      if (m === 'GET' && seg[0] === 'reading' && seg[1]) return readerView(seg[1], query);
      if (m === 'POST' && seg[0] === 'sessions') return saveSession(body);
      if (m === 'GET' && seg[0] === 'streaks') return streaksView(query);
      if (m === 'GET' && seg[0] === 'lists') return lists(query);
      if (m === 'POST' && seg[0] === 'tbr' && seg[1] === 'remove') return removeFromList(body);
      if (m === 'POST' && seg[0] === 'tbr' && !seg[1]) return addToList(body);
      if (m === 'GET' && seg[0] === 'discover') return discover(query);
      if (m === 'POST' && seg[0] === 'follow') return follow(body);
      if (m === 'GET' && seg[0] === 'meetups' && !seg[1]) return meetups(query);
      if (m === 'GET' && seg[0] === 'meetups' && seg[1] && seg[2] === 'ics') return meetupIcs(seg[1]);
      if (m === 'POST' && seg[0] === 'meetups' && seg[1] && seg[2] === 'rsvp') return rsvp(seg[1], body);
      if (m === 'POST' && seg[0] === 'meetups' && seg[1] && seg[2] === 'cancel') return cancelRsvp(seg[1], body);
      if (m === 'POST' && seg[0] === 'rsvps' && seg[1]) return decideRsvp(seg[1], body);
      if (m === 'POST' && seg[0] === 'reset') {
        if (!store.reset) throw new HttpError(403, 'Reset is only available in offline mode. In live mode, re-run npm run db:seed.');
        await store.reset();
        return { outcome: 'reset', message: 'Demo data restored.' };
      }
      throw new HttpError(404, `No route ${m} ${path}`);
    }

    async function handle(method, path, body, query) {
      try {
        const out = await route(method, path, body || {}, query || {});
        if (out && out.__raw !== undefined) return { status: 200, body: out.__raw, contentType: out.contentType, filename: out.filename };
        return { status: 200, body: out };
      } catch (err) {
        if (err instanceof HttpError) return { status: err.status, body: { error: err.message, ...err.extra } };
        return { status: 500, body: { error: 'Something went wrong on the server. Check the server log.', detail: String(err && err.message || err) } };
      }
    }

    return { handle };
  }

  return { createEngine, HttpError };
});
