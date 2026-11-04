/* Readaroo web app. Talks to window.ReadarooAPI.call(method, path, query, body, opts) -> { status, body }.
 * The real app uses HTTP (public/api-http.js); the HTML demo runs the same engine in the page. */
(function () {
  'use strict';
  const api = window.ReadarooAPI;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (c) => `$${(c / 100).toFixed(2)}`;
  const REACT = { loved: 'Loved it', ok: 'It was OK', not_for_me: 'Not for me' };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  const state = {
    actor: 'm-priya', view: 'home', titleId: null, member: null, q: '', members: [], toastTimer: null,
    listMember: null, discoverMember: null, borrowId: null, reader: null,
    animate: true, pending: 0, lastClick: null,
  };

  async function call(method, path, query, body, opts) {
    return api.call(method, path, { actor: state.actor, ...(query || {}) }, body ? { actor: state.actor, ...body } : undefined, opts);
  }
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { el.hidden = true; }, 5600);
  }
  const me = () => state.members.find((m) => m.id === state.actor) || { role: 'parent', name: '' };
  const isKid = () => me().role === 'kid';
  const nameOf = (id) => (state.members.find((m) => m.id === id) || {}).name || id;
  const when = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PT';

  // Roo, the Readaroo kangaroo (original artwork, drawn inline so it works offline)
  function roo(cls) {
    return `<svg class="roo ${cls || ''}" viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="62" cy="114" rx="34" ry="5" fill="#1D2A44" opacity=".08"/>
      <path d="M38 98c-16 2-28-2-32-10 10 3 20 2 30-3z" fill="#E39A57"/>
      <ellipse cx="62" cy="82" rx="27" ry="28" fill="#F2AE6B"/>
      <ellipse cx="62" cy="90" rx="17" ry="15" fill="#FCDDB6"/>
      <ellipse cx="44" cy="108" rx="15" ry="5.5" fill="#E39A57"/><ellipse cx="80" cy="108" rx="15" ry="5.5" fill="#E39A57"/>
      <rect x="48" y="78" width="28" height="19" rx="3" fill="#5B3FE0"/><path d="M62 78v19" stroke="#fff" stroke-width="2"/>
      <path d="M52 83h6M52 87h6M66 83h6M66 87h6" stroke="#C9BFFF" stroke-width="1.5" stroke-linecap="round"/>
      <ellipse cx="46" cy="86" rx="5" ry="7" fill="#E39A57"/><ellipse cx="78" cy="86" rx="5" ry="7" fill="#E39A57"/>
      <g class="ear-l"><path d="M47 30c-8-14-6-26 1-27 6 1 8 13 6 27z" fill="#F2AE6B"/><path d="M49 26c-4-9-3-17 0-18 3 1 4 9 3 18z" fill="#FF9E9E"/></g>
      <path d="M73 30c8-14 6-26-1-27-6 1-8 13-6 27z" fill="#F2AE6B"/><path d="M71 26c4-9 3-17 0-18-3 1-4 9-3 18z" fill="#FF9E9E"/>
      <circle cx="60" cy="44" r="22" fill="#F2AE6B"/>
      <ellipse cx="60" cy="52" rx="12" ry="9" fill="#FCDDB6"/>
      <circle cx="52" cy="40" r="3.4" fill="#1D2A44"/><circle cx="68" cy="40" r="3.4" fill="#1D2A44"/>
      <circle cx="53.2" cy="38.8" r="1.1" fill="#fff"/><circle cx="69.2" cy="38.8" r="1.1" fill="#fff"/>
      <ellipse cx="60" cy="48" rx="3.6" ry="2.6" fill="#1D2A44"/>
      <path d="M55 54q5 4 10 0" stroke="#1D2A44" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="46" cy="49" r="3.2" fill="#FF8C8C" opacity=".55"/><circle cx="74" cy="49" r="3.2" fill="#FF8C8C" opacity=".55"/>
    </svg>`;
  }
  const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    discover: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    lists: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    events: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M12 13l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 15.3l2-.3z"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    guide: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
    approvals: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    digest: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    payments: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  // Confetti for wins (skipped when the viewer prefers less motion)
  const confetti = (() => {
    let canvas = null;
    let ctx = null;
    let parts = [];
    let raf = null;
    const colors = ['#5B3FE0', '#FFC93C', '#19A47A', '#FF6F61', '#49A8FF'];
    function step() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.22; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - p.life / 120); ctx.fillStyle = p.c;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      parts = parts.filter((p) => p.life < 120 && p.y < innerHeight + 40);
      if (parts.length) raf = requestAnimationFrame(step);
      else { raf = null; ctx.clearRect(0, 0, innerWidth, innerHeight); }
    }
    return function burst(n, x, y) {
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'confetti';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');
      }
      const dpr = window.devicePixelRatio || 1;
      canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = x ?? innerWidth / 2;
      const cy = y ?? innerHeight * 0.4;
      for (let i = 0; i < (n || 70); i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
        const sp = 5 + Math.random() * 8;
        parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
          w: 6 + Math.random() * 6, h: 9 + Math.random() * 8, c: colors[i % colors.length], life: 0, round: i % 4 === 0 });
      }
      if (!raf) raf = requestAnimationFrame(step);
    };
  })();
  const BIG_WINS = ['finished', 'instant_borrowed', 'going', 'approved'];
  const SMALL_WINS = ['borrowed', 'listed', 'followed', 'hold_placed', 'reacted', 'requested'];
  function celebrate(body) {
    if (!body) return;
    const at = state.lastClick || {};
    if (BIG_WINS.includes(body.outcome)) confetti(110, at.x, at.y);
    else if (SMALL_WINS.includes(body.outcome)) confetti(36, at.x, at.y);
    else if (body.streak && body.streak.readToday && body.savedMinutes > 0) confetti(60, at.x, at.y);
  }

  function cover(t, big) {
    return `<div class="cover${big ? ' big' : ''}" style="background:${esc(t.color || '#556')}" aria-hidden="true">${esc((t.title || '').toUpperCase())}</div>`;
  }
  function statusPill(s, label) {
    if (s === 'available') return '<span class="pill ok">Available now</span>';
    if (s === 'check') return '<span class="pill check">Check availability</span>';
    if (s === 'coming') return `<span class="pill kid">${esc(label || 'Coming soon')}</span>`;
    if (s === 'none') return '<span class="pill wait">Not at your libraries</span>';
    return '<span class="pill wait">Wait list</span>';
  }
  function progressBar(pct, label) {
    return `<div class="bar" role="img" aria-label="${esc(label || `${pct}% read`)}"><span style="width:${Math.min(100, pct)}%"></span></div>`;
  }
  function memberPicker(selected, attr, includeParent) {
    const people = state.members.filter((m) => includeParent || m.role === 'kid');
    return `<div class="nav" role="group" aria-label="Whose">${people.map((m) =>
      `<button type="button" ${attr}="${m.id}" ${m.id === selected ? 'aria-current="page"' : ''}>${esc(m.name)}${m.age ? ` (${m.age})` : ''}</button>`).join('')}</div>`;
  }

  // ---------- streak card ----------
  function streakCard(s, big) {
    const dots = (s.calendar || []).map((d, i) => {
      const cls = d.read ? 'on' : d.rest ? 'rest' : '';
      const label = `${d.day}: ${d.read ? `${d.minutes} min` : d.rest ? 'rest day' : 'no reading'}${d.today ? ' (today)' : ''}`;
      return `<span class="dot ${cls} ${d.today ? 'today' : ''}" style="--d:${i}" title="${esc(label)}" aria-label="${esc(label)}"></span>`;
    }).join('');
    return `<div class="card streak ${big ? 'big' : ''}">
      <div class="row"><div class="streak-num"><b>${s.current}</b><span>day streak</span></div>
        <div class="grow"><p>${esc(s.message)}</p>
        <p class="small muted">${s.weekDays} of ${s.weeklyGoal} reading days this week${s.restDays && s.restDays.length ? ' · 1 rest day used' : ''}</p></div></div>
      ${dots ? `<div class="dots" role="img" aria-label="Last 14 days of reading">${dots}</div>
      <p class="small muted legend"><span class="dot on"></span> read <span class="dot rest"></span> rest day (one a week keeps your streak) <span class="dot today"></span> today</p>` : ''}
      ${s.badges && s.badges.length ? `<div class="reactions">${s.badges.map((b) => `<span class="pill kid">${esc(b)}</span>`).join('')}</div>` : ''}
    </div>`;
  }

  // ---------- navigation ----------
  function go(view, extra) {
    if (state.view === 'reader' && view !== 'reader') { flushReading(false); state.reader = null; }
    Object.assign(state, { view, animate: true }, extra || {});
    render();
    window.scrollTo({ top: 0 });
  }
  function navBar() {
    const tabs = isKid()
      ? [['home', 'My books'], ['discover', 'Discover'], ['lists', 'My list'], ['events', 'Events'], ['guide', 'Demo guide']]
      : [['home', 'Home'], ['discover', 'Discover'], ['lists', 'Lists'], ['events', 'Events'], ['approvals', 'Approvals'], ['digest', 'Digest'], ['library', 'Payments'], ['guide', 'Demo guide']];
    return `<nav class="nav topnav" aria-label="Sections">${tabs.map(([v, l]) =>
      `<button type="button" data-go="${v}" class="${v === 'guide' ? 'nav-guide' : ''}" ${state.view === v ? 'aria-current="page"' : ''}>${l}</button>`).join('')}</nav>`;
  }

  function tabBar() {
    const kid = isKid();
    const tabs = kid
      ? [['home', 'My books', 'home'], ['discover', 'Find', 'discover'], ['lists', 'My list', 'lists'], ['events', 'Events', 'events'], ['guide', 'Guide', 'guide']]
      : [['home', 'Home', 'home'], ['discover', 'Discover', 'discover'], ['lists', 'Lists', 'lists'], ['events', 'Events', 'events'], ['more', 'More', 'more']];
    const underMore = ['more', 'approvals', 'digest', 'library', 'guide'];
    const current = (v) => state.view === v || (!kid && v === 'more' && underMore.includes(state.view));
    return `<ul>${tabs.map(([v, label, ic]) => `<li><button type="button" class="tab" data-go="${v}" ${current(v) ? 'aria-current="page"' : ''}>
      ${icon(ic)}<span>${label}</span>${v === 'more' && state.pending ? `<span class="badge" aria-label="${state.pending} to review">${state.pending}</span>` : ''}</button></li>`).join('')}</ul>`;
  }

  // ---------- more (phones: the sections that don't fit the tab bar) ----------
  function viewMore() {
    const rows = [
      ['approvals', 'approvals', 'Approvals', state.pending ? `${plural(state.pending, 'request')} waiting` : 'Book and event requests from the kids'],
      ['library', 'payments', 'Payments', 'Library-funded instant borrows, budgets and Stripe charges'],
      ['digest', 'digest', 'Family digest', 'This week: books finished, reading time, streaks'],
      ['guide', 'guide', 'Demo guide', 'Open any demo record and see the audit log'],
    ];
    return `<h1>More</h1><ul class="list more-list">${rows.map(([v, ic, t, d]) => `<li><button type="button" class="item" data-go="${v}">${icon(ic)}
      <div class="grow"><div class="title">${t}</div><div class="small muted">${d}</div></div></button></li>`).join('')}</ul>`;
  }

  // ---------- home ----------
  async function viewHome() {
    const r = await call('GET', '/api/home');
    if (r.status !== 200) return errorBox(r);
    const d = r.body;
    state.members = d.members;
    if (isKid()) return kidHome(d);
    const requests = d.pendingApprovals.length + d.meetupRequests.length;
    state.pending = requests;
    return `
      <div class="hero">${roo('')}<div class="bubble"><p class="muted small">Pinned demo date ${esc(d.now.slice(0, 10))}</p><h1>${esc(d.family.name)} library</h1></div></div>
      <div class="members">${d.members.map((m) => {
        const s = d.streaks.find((x) => x.memberId === m.id);
        return `<button type="button" class="member" data-actor="${m.id}" aria-label="Switch to ${esc(m.name)}'s view">
          <span class="avatar ${m.role === 'kid' ? 'kid' : ''}">${esc(m.name[0])}</span>
          <span>${esc(m.name)}${m.age ? `, ${m.age}` : ''}</span>
          <span class="streak-chip ${s && s.current ? '' : 'zero'}">${s ? s.current : 0}-day streak</span>
        </button>`;
      }).join('')}</div>
      ${requests ? `<button type="button" class="notice sun" data-go="approvals"><b>${plural(requests, 'request')} to review</b>
        <span class="small">${d.pendingApprovals[0] ? `${esc(nameOf(d.pendingApprovals[0].memberId))} asked for ${esc(d.pendingApprovals[0].title)}` : `${esc(nameOf(d.meetupRequests[0].by))} wants to go to ${esc(d.meetupRequests[0].title)}`}</span></button>` : ''}
      ${d.nextMeetup ? `<button type="button" class="notice ok" data-go="events"><b>${esc(d.nextMeetup.title)}</b>
        <span class="small">${esc(when(d.nextMeetup.startsAt))} · ${esc(d.nextMeetup.venue)} · ${esc(d.nextMeetup.why[0] || '')} · ${plural(d.nextMeetup.seatsLeft, 'seat')} left</span></button>` : ''}
      <div class="section"><h2>Reading now</h2>${readingList(d.reading, false)}</div>
      <div class="section"><h2>On hold</h2>${holdList(d.holds)}</div>
      <div class="section"><h2>From your lists</h2>
        <ul class="list">${d.members.map((m) => `<li><button type="button" class="item" data-list-member="${m.id}">
          <div class="grow"><div class="title">${esc(m.name)}'s list</div><div class="muted small">${d.listReady[m.id] ? `${plural(d.listReady[m.id], 'book')} ready to borrow now` : 'Nothing ready yet'}</div></div></button></li>`).join('')}</ul>
      </div>`;
  }

  async function kidHome(d) {
    const m = me();
    const s = await call('GET', '/api/streaks');
    const streak = s.status === 200 ? s.body.streaks[0] : null;
    const mine = d.reading.filter((b) => b.memberId === m.id);
    const holds = d.holds.filter((h) => h.memberId === m.id);
    return `
      <div class="hero">${roo('hop')}<div class="bubble"><h1>Hi ${esc(m.name)}!</h1><p class="muted">${streak && streak.readToday ? 'You read today. High five!' : 'Ready for a story?'} Books for ages ${m.bandMin}–${m.bandMax} show up first.</p></div></div>
      ${streak ? streakCard(streak, true) : ''}
      <div class="section"><h2>Reading now</h2>${readingList(mine, true)}</div>
      ${d.listReady[m.id] ? `<button type="button" class="notice ok" data-go="lists"><b>${plural(d.listReady[m.id], 'book')} on your list ${d.listReady[m.id] === 1 ? 'is' : 'are'} ready</b><span class="small">Borrow ${d.listReady[m.id] === 1 ? 'it' : 'one'} tonight</span></button>` : ''}
      <div class="section"><h2>Coming soon</h2>${holdList(holds)}</div>
      <button type="button" class="btn sun" data-go="discover">Find something good</button>`;
  }

  function holdList(holds) {
    if (!holds.length) return '<p class="muted small">No holds right now.</p>';
    return `<ul class="list">${holds.map((h) => `<li><button type="button" class="item" data-title="${h.titleId}" data-member="${h.memberId}">
      ${cover(h)}<div class="grow"><div class="title">${esc(h.title)}</div>
      <div class="muted small">For ${esc(nameOf(h.memberId))} · #${h.position} at ${esc(h.libraryName)} · ${esc(h.waitLabel)}</div>
      <div class="small accent">See what to read tonight</div></div></button></li>`).join('')}</ul>`;
  }

  function readingList(items, kid) {
    if (!items.length) return `<div class="roo-empty">${roo('')}<p class="muted small">Nothing checked out right now. Find something good in Discover.</p></div>`;
    return `<ul class="list">${items.map((b) => `<li class="item">${cover(b)}<div class="grow">
      <div class="title">${esc(b.title)}</div>
      <div class="muted small">${kid ? '' : `${esc(nameOf(b.memberId))} · `}${b.currentPage ? `page ${b.currentPage} of ${b.pages}` : 'Not started'}${b.kind === 'instant' ? ' · library-funded' : ''}</div>
      ${progressBar(b.pct, `${b.pct}% read`)}
      <div class="actions" style="margin-top:8px"><button type="button" class="btn primary small" data-read="${b.id}">${b.currentPage ? 'Continue reading' : 'Start reading'}</button></div>
      ${kid ? `<details class="small"><summary>Finished? Tell us how it was</summary><div class="reactions">${Object.entries(REACT).map(([k, l]) =>
        `<button type="button" class="btn ghost small" data-react="${k}" data-borrow="${b.id}">${l}</button>`).join('')}</div></details>` : ''}
      </div></li>`).join('')}</ul>`;
  }

  // ---------- reader: tracks time and page, saves even if you leave ----------
  async function viewReader() {
    const r = await call('GET', `/api/reading/${encodeURIComponent(state.borrowId)}`);
    if (r.status !== 200) return errorBox(r);
    const d = r.body;
    if (!state.reader || state.reader.borrowId !== d.borrowId) {
      state.reader = {
        borrowId: d.borrowId, actor: state.actor, clientId: `rd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        page: d.currentPage, startPage: d.currentPage, pages: d.pages, activeMs: 0, since: Date.now(), secondsPerMinute: d.secondsPerMinute,
        visible: true, flushedMinutes: 0,
      };
    }
    const rd = state.reader;
    return `
      <button type="button" class="btn quiet back" data-go="home">← Back</button>
      <div class="row" style="align-items:flex-start">${cover(d.title, true)}
        <div class="grow section"><h1 style="font-size:1.4rem">${esc(d.title.title)}</h1><p class="muted">${esc(d.title.author)} · ${esc(d.member.name)} is reading</p>
        <p class="small muted">${d.lastReadAt ? `Picked up where ${esc(d.member.name)} left off` : 'First time opening this book'}</p></div></div>
      ${d.finished ? '<div class="notice ok"><b>Finished!</b><span class="small">Tell us how it was from My books.</span></div>' : `
      <div class="card reader">
        <div class="row"><div class="grow"><div class="title">Page <span id="rd-page">${rd.page}</span> of ${d.pages}</div>
          <div class="small muted">Reading time this session: <span id="rd-time">0 min</span></div></div>
          <span class="pill ok" id="rd-saved">Auto-save on</span></div>
        ${progressBar(Math.round((rd.page / d.pages) * 100), 'Progress')}
        <div class="actions">
          <button type="button" class="btn ghost small" data-page="-1" aria-label="Back one page">− 1 page</button>
          <button type="button" class="btn ghost small" data-page="1">+ 1 page</button>
          <button type="button" class="btn ghost small" data-page="10">+ 10 pages</button>
        </div>
        <div class="actions">
          <button type="button" class="btn primary" data-reader="done">Done for now</button>
          <button type="button" class="btn sun" data-reader="finished">I finished the book</button>
        </div>
        <p class="small muted">Close the tab, switch apps or tap Back mid-chapter: your time and page are saved. ${d.secondsPerMinute < 60 ? `Demo speed: each real second counts as ${d.secondsPerMinute === 1 ? 'a minute' : `1/${60 / d.secondsPerMinute} minute`}.` : ''}</p>
      </div>`}
      ${streakCard(d.streak, false)}`;
  }
  function readerMinutes() {
    const rd = state.reader;
    if (!rd) return 0;
    const ms = rd.activeMs + (rd.visible ? Date.now() - rd.since : 0);
    return Math.floor(ms / 1000 / rd.secondsPerMinute);
  }
  function tickReader() {
    if (state.view !== 'reader' || !state.reader) return;
    const el = $('#rd-time');
    if (el) el.textContent = `${readerMinutes()} min`;
  }
  setInterval(tickReader, 1000);
  async function flushReading(keepalive, opts) {
    const rd = state.reader;
    if (!rd) return null;
    const minutes = readerMinutes();
    const moved = rd.page !== rd.startPage;
    if (minutes < 1 && !moved && !(opts && opts.finished)) return null;
    const r = await call('POST', '/api/sessions', null, {
      actor: rd.actor, borrowId: rd.borrowId, clientId: rd.clientId, minutes: Math.max(1, minutes), toPage: opts && opts.finished ? rd.pages : rd.page,
    }, { keepalive });
    return r;
  }
  document.addEventListener('visibilitychange', () => {
    const rd = state.reader;
    if (!rd || state.view !== 'reader') return;
    if (document.visibilityState === 'hidden') {
      rd.activeMs += Date.now() - rd.since;
      rd.visible = false;
      flushReading(true);
    } else {
      rd.since = Date.now();
      rd.visible = true;
    }
  });
  window.addEventListener('pagehide', () => { if (state.view === 'reader') flushReading(true); });

  // ---------- discover: picks, new releases, search ----------
  async function viewDiscover() {
    const member = isKid() ? state.actor : (state.discoverMember || state.members.find((m) => m.role === 'kid').id);
    const [r, s] = await Promise.all([
      call('GET', '/api/discover', { member }),
      state.q ? call('GET', '/api/titles', { member, q: state.q }) : Promise.resolve(null),
    ]);
    if (r.status !== 200) return errorBox(r);
    const d = r.body;
    const who = isKid() ? 'you' : d.member.name;
    const followed = new Set(d.follows.map((f) => `${f.kind}:${f.value}`));
    const row = (t, extra) => `<li><div class="item">${cover(t)}<div class="grow">
        <button type="button" class="linkish title" data-title="${t.id}" data-member="${member}">${esc(t.title)}</button>
        <div class="muted small">${esc(t.author)} · ${esc(t.level)}${t.rating && !(t.why || []).some((w) => w.startsWith('Loved by')) ? ` · loved by ${t.rating.pct}% of readers ${esc(d.member.band)}` : ''}</div>
        <div>${statusPill(t.status, t.statusLabel)} ${t.onHold ? '<span class="pill wait">On hold</span>' : ''} ${t.onList ? '<span class="pill wait">On list</span>' : ''} ${t.needsOk ? '<span class="pill kid">Ask a grown-up</span>' : ''}</div>
        ${extra || ''}</div></div></li>`;
    return `
      <h1>Discover</h1>
      ${isKid() ? '' : memberPicker(member, 'data-discover-member', true)}
      <form class="search" id="search-form" role="search">
        <label for="q" class="visually-hidden">Search titles</label>
        <input id="q" name="q" type="search" placeholder="Title, author or series" value="${esc(state.q)}" autocomplete="off">
        <button class="btn primary" type="submit">Search</button>
      </form>
      ${s && s.status === 200 ? `<div class="section"><h2>Results for “${esc(state.q)}”</h2><ul class="list">${s.body.results.map((t) => row({ ...t, needsOk: isKid() && !t.inBand })).join('') || '<p class="muted">No matches.</p>'}</ul>
        <button type="button" class="btn quiet back" data-clear-search="1">Clear search</button></div>` : ''}
      <div class="section"><h2>Good picks for ${esc(who)}</h2>
        <p class="small muted">Based on what ${esc(who)} loved, finished and saved. Every pick says why.</p>
        <ul class="list">${d.picks.map((t) => row(t, `<p class="small accent">${t.why.map(esc).join(' · ')}</p>`)).join('') || '<p class="muted small">Finish a book and react to it to get picks.</p>'}</ul></div>
      ${d.comingSoon.length ? `<div class="section"><h2>Coming soon</h2><ul class="list">${d.comingSoon.map((t) => row(t, `
        <p class="small muted">${t.series ? `${esc(t.series)} #${t.seriesNo}` : 'New book'}${t.followed ? ' · you follow this' : ''} · your libraries have copies on order</p>
        <div class="actions">${t.onHold ? '' : `<button type="button" class="btn primary small" data-prehold="${t.id}" data-member="${member}">Get in line now</button>`}
          ${t.series ? `<button type="button" class="btn ghost small" data-follow="series" data-value="${esc(t.series)}" data-on="${followed.has(`series:${t.series}`) ? 'false' : 'true'}" data-member="${member}">${followed.has(`series:${t.series}`) ? 'Following' : 'Follow series'}</button>` : ''}</div>`)).join('')}</ul></div>` : ''}
      <div class="section"><h2>New arrivals</h2><p class="small muted">Released in the last 30 days at your libraries.</p>
        <ul class="list">${d.newArrivals.map((t) => row(t, `<p class="small muted">Released ${esc(t.released)}</p>
          <div class="actions"><button type="button" class="btn ghost small" data-follow="author" data-value="${esc(t.author)}" data-on="${followed.has(`author:${t.author}`) ? 'false' : 'true'}" data-member="${member}">${followed.has(`author:${t.author}`) ? 'Following' : `Follow ${esc(t.author)}`}</button>
          ${t.onList ? '' : `<button type="button" class="btn ghost small" data-add-list="${t.id}" data-member="${member}">Add to list</button>`}</div>`)).join('') || '<p class="muted small">Nothing new this month.</p>'}</ul></div>`;
  }

  // ---------- lists by age group ----------
  async function viewLists() {
    const member = isKid() ? state.actor : (state.listMember || state.members.find((m) => m.role === 'kid').id);
    const r = await call('GET', '/api/lists', { member });
    if (r.status !== 200) return errorBox(r);
    const d = r.body;
    const whose = isKid() ? 'My' : `${esc(d.member.name)}'s`;
    const listRow = (t) => `<li><div class="item">${cover(t)}<div class="grow">
        <button type="button" class="linkish title" data-title="${t.id}" data-member="${member}">${esc(t.title)}</button>
        <div class="muted small">${esc(t.author)} · ${esc(t.level)} · added by ${t.source === 'self' ? (isKid() ? 'you' : esc(t.addedBy)) : esc(t.addedBy)}</div>
        <div>${statusPill(t.status, t.statusLabel)} ${t.needsOk ? '<span class="pill kid">Ask a grown-up to borrow</span>' : ''}</div>
        <div class="actions" style="margin-top:6px">
          ${t.status === 'available' && !t.needsOk ? `<button type="button" class="btn primary small" data-borrow-title="${t.id}" data-member="${member}">Borrow</button>` : `<button type="button" class="btn ghost small" data-title="${t.id}" data-member="${member}">Open</button>`}
          <button type="button" class="btn ghost small" data-remove-list="${t.id}" data-member="${member}">Remove</button>
        </div></div></div></li>`;
    return `
      <h1>${whose} want-to-read list</h1>
      ${isKid() ? '' : memberPicker(member, 'data-list-member', true)}
      <p class="small muted">${d.readyCount ? `${plural(d.readyCount, 'book')} ready to borrow now. ` : ''}Ready books float to the top.</p>
      <ul class="list">${d.list.map(listRow).join('') || '<p class="muted small">Nothing saved yet. Add books from the shelves below.</p>'}</ul>
      <div class="section"><h2>Shelves by age group</h2><p class="small muted">Picked by the librarians at your libraries.</p></div>
      ${d.shelves.map((sh) => `<div class="card"><div class="row"><h3 class="grow">${esc(sh.name)}</h3>${sh.stretch ? '<span class="pill kid">Next level up</span>' : ''}</div>
        <p class="small muted">${esc(sh.curator)}${sh.forWhom.length ? ` · fits ${esc(sh.forWhom.join(', '))}` : ''}${sh.stretch ? ' · you can save these; borrowing needs a grown-up' : ''}</p>
        <ul class="list compact">${sh.items.map((t) => `<li class="row"><button type="button" class="linkish grow" data-title="${t.id}" data-member="${member}">${esc(t.title)}</button>
          ${statusPill(t.status, t.statusLabel)}
          ${t.onList ? '<span class="pill wait">On list</span>' : `<button type="button" class="btn ghost small" data-add-list="${t.id}" data-member="${member}">Add</button>`}</li>`).join('')}</ul></div>`).join('')}`;
  }

  // ---------- author talks and meetups ----------
  async function viewEvents() {
    const r = await call('GET', '/api/meetups');
    if (r.status !== 200) return errorBox(r);
    const kid = isKid();
    const cards = r.body.meetups.map((m) => {
      const pre = state.members.filter((x) => m.goodFor.includes(x.name)).map((x) => x.id);
      if (m.needsAdult && state.members.some((x) => x.role === 'kid' && pre.includes(x.id)) && !pre.includes(state.actor)) pre.push(state.actor);
      const choose = kid || m.rsvp ? '' : `<fieldset class="attendees"><legend class="small">Who's going?</legend>${state.members.map((x) => {
        const fits = x.role === 'parent' ? true : (x.age >= m.minAge && x.age <= m.maxAge);
        return `<label class="check"><input type="checkbox" name="att-${m.id}" value="${x.id}" ${pre.includes(x.id) ? 'checked' : ''} ${fits ? '' : 'disabled'}> ${esc(x.name)}${fits ? '' : ' (ages don’t fit)'}</label>`;
      }).join('')}</fieldset>`;
      let action;
      if (m.rsvp) {
        action = `<div class="notice ${m.rsvp.status === 'going' ? 'ok' : 'warn'}"><b>${m.rsvp.status === 'going' ? 'You’re going' : 'On the waitlist'}</b><span class="small">${esc(m.rsvp.attendees.join(', '))}</span></div>
          ${kid ? '' : `<div class="actions"><button type="button" class="btn ghost small" data-cancel-meetup="${m.id}">${m.rsvp.status === 'going' ? 'Cancel and free the seats' : 'Leave the waitlist'}</button>${api.files ? `<a class="btn ghost small" href="/api/meetups/${m.id}/ics">Add to calendar</a>` : ''}</div>`}`;
      } else if (kid) {
        action = m.viewerRequested ? '<div class="notice sun"><b>You asked a grown-up</b><span class="small">They’ll see it in Approvals.</span></div>'
          : `<button type="button" class="btn sun" data-ask-meetup="${m.id}">Ask to go</button>`;
      } else {
        action = `${choose}<div class="actions"><button type="button" class="btn ${m.availability === 'full' ? 'ghost' : 'primary'}" data-rsvp="${m.id}">${m.availability === 'full' ? 'Join the waitlist' : 'Book free seats'}</button></div>
          ${m.requests.length ? `<p class="small">${esc(m.requests.map((q) => q.by).join(', '))} asked to go — answer in Approvals.</p>` : ''}`;
      }
      return `<li class="card">
        <div class="row"><span class="pill ${m.venueKind === 'bookstore' ? 'kid' : 'ok'}">${esc(m.kind)} · ${esc(m.venueKind)}</span>
          <span class="grow"></span>${m.availability === 'full' ? '<span class="pill bad">Full</span>' : m.availability === 'few' ? `<span class="pill check">${plural(m.seatsLeft, 'seat')} left</span>` : `<span class="pill wait">${m.seatsLeft} seats</span>`}</div>
        <h3>${esc(m.title)}</h3>
        <p class="small"><b>${esc(when(m.startsAt))}</b> · ${esc(m.venue)}, ${esc(m.address)}</p>
        <p class="small muted">${esc(m.ages)} · ${esc(m.priceLabel)}${m.goodFor.length ? ` · good for ${esc(m.goodFor.join(', '))}` : ''}${m.needsAdult ? ' · kids under 13 come with a grown-up' : ''}</p>
        ${m.why.length ? `<p class="small accent">${m.why.map(esc).join(' · ')}</p>` : ''}
        <p class="small">${esc(m.description)}</p>
        ${action}</li>`;
    }).join('');
    return `<h1>Author talks and meetups</h1>
      <p class="small muted">Readings, signings, storytimes and book clubs at your libraries and nearby bookstores. Events tied to books your family reads come first. All venues and events are fictional.</p>
      <ul class="list">${cards || '<p class="muted">No upcoming events.</p>'}</ul>`;
  }

  // ---------- title ----------
  async function viewTitle() {
    const r = await call('GET', `/api/titles/${encodeURIComponent(state.titleId)}`, { member: state.member || state.actor });
    if (r.status !== 200) return errorBox(r);
    const d = r.body;
    const t = d.title;
    const anyReady = d.availability.some((a) => a.status === 'available');
    const anyStale = d.availability.some((a) => a.status === 'check');
    const coming = d.availability.some((a) => a.status === 'coming');
    let actions = '';
    if (d.borrowed) {
      actions = `<div class="notice ok"><b>${esc(d.member.name)} has this book</b><span class="small">${d.borrowed.kind === 'instant' ? 'Instant borrow, funded by the library.' : 'Checked out for 21 days.'}</span></div>
        <button type="button" class="btn primary" data-read="${d.borrowed.id}">Continue reading</button>`;
    } else if (d.pendingApprovalId) {
      actions = '<div class="notice sun"><b>Waiting for a grown-up</b><span class="small">A parent will see this request in Approvals.</span></div>';
    } else if (d.needsApproval) {
      actions = `<div class="notice sun"><b>This one needs a grown-up's OK</b><span class="small">${t.levelKnown ? `${esc(t.level)} is outside your band (${me().bandMin}–${me().bandMax}).` : 'We don’t know this book’s reading level yet.'}</span></div>
        <button type="button" class="btn sun" data-act="borrow">Ask to borrow</button>`;
    } else {
      const btns = [];
      if (anyReady) btns.push('<button type="button" class="btn primary" data-act="borrow">Borrow now</button>');
      if (anyStale) btns.push('<button type="button" class="btn ghost" data-act="refresh">Refresh availability</button>');
      if (!anyReady && !d.hold) btns.push(`<button type="button" class="btn ghost" data-act="hold">${coming ? 'Get in line before release' : 'Place hold (shortest line)'}</button>`);
      actions = `<div class="actions">${btns.join('')}</div>`;
    }
    const extras = `<div class="actions">
      ${d.onList ? '<span class="pill wait">On the list</span>' : `<button type="button" class="btn ghost small" data-add-list="${t.id}" data-member="${d.member.id}">Add to ${d.member.id === state.actor ? 'my' : `${esc(d.member.name)}'s`} list</button>`}
      ${t.series ? `<button type="button" class="btn ghost small" data-follow="series" data-value="${esc(t.series)}" data-on="${d.followingSeries ? 'false' : 'true'}" data-member="${d.member.id}">${d.followingSeries ? `Following ${esc(t.series)}` : `Follow ${esc(t.series)}`}</button>` : ''}</div>`;
    const instant = d.borrowed ? '' : d.instant && d.instant.eligible && !d.needsApproval && !d.pendingApprovalId ? `
      <div class="card">
        <h3>Library-funded instant borrow</h3>
        <p class="small muted">${esc(d.instant.libraryName)} pays ${money(d.instant.priceCents)} so ${esc(d.member.name)} can keep reading the series instead of waiting ${esc(d.instant.waitLabel)}. Recorded in Stripe test mode; never over the library's cap.</p>
        <button type="button" class="btn sun" data-act="instant">Borrow instantly</button>
      </div>` : (t.seriesNo >= 2 && d.instant && !anyReady && !coming
      ? (d.instant.capReached
        ? `<div class="notice warn"><b>No instant borrow today</b><span class="small">${esc(d.instant.reason)} Nothing is charged.</span></div>`
        : `<p class="muted small">Instant borrow not offered: ${esc(d.instant.reason)}</p>`)
      : '');
    const hold = d.hold ? `<div class="notice ok"><b>On hold for ${esc(d.member.name)}</b><span class="small">#${d.hold.position} at ${esc(d.hold.libraryName)} · likely ${esc(d.hold.waitLabel)}</span></div>` : '';
    const next = d.nextUp && !coming ? nextUpBlock(d) : '';
    return `
      <button type="button" class="btn quiet back" data-go="home">← Back</button>
      <div class="row" style="align-items:flex-start">${cover(t, true)}
        <div class="grow section"><h1 style="font-size:1.4rem">${esc(t.title)}</h1>
          <p class="muted">${esc(t.author)}${t.series ? ` · ${esc(t.series)} #${t.seriesNo}` : ''} · ${t.pages} pages</p>
          <p><span class="pill ${t.levelKnown ? 'wait' : 'check'}">${esc(t.level)}</span> <span class="small muted">for ${esc(d.member.name)}</span></p>
        </div></div>
      ${hold}${actions}${extras}${instant}${next}
      <div class="card"><h3>At your libraries</h3>
        <table class="avail"><tbody>${d.availability.map((a) => `<tr>
          <td><b>${esc(a.libraryName)}</b><br><span class="muted small">${a.status === 'coming' ? `${a.onOrder} on order` : `${a.owned} cop${a.owned === 1 ? 'y' : 'ies'}`}${a.status === 'check' ? ` · last synced ${esc(a.asOf.slice(0, 10))}` : ''}</span></td>
          <td>${a.status === 'available' ? '<span class="pill ok">Available now</span>' : a.status === 'check' ? '<span class="pill check">Check availability</span>' : a.status === 'coming' ? `<span class="pill kid">${esc(a.statusLabel)}</span><br><span class="small muted">new hold: ${esc(a.newHoldWaitLabel)}</span>` : `<span class="pill wait">${esc(a.statusLabel)}</span><br><span class="small muted">new hold: ${esc(a.newHoldWaitLabel)}</span>`}</td>
        </tr>`).join('')}</tbody></table></div>`;
  }

  function nextUpBlock(d) {
    const n = d.nextUp;
    const excluded = n.excluded.length ? `<p class="small muted">Not suggested: ${n.excluded.map((x) => `${esc(x.title)} (${esc(x.reason.toLowerCase())})`).join('; ')}.</p>` : '';
    if (!n.suggestions.length) return `<div class="card"><h3>Next-Up</h3><p class="muted small">No available read-alikes right now.</p>${excluded}</div>`;
    return `
      <div class="nextup"><span class="eyebrow">Next-Up · read tonight</span>
        <b style="font-family:var(--font-display);font-size:1.15rem">Don't wait. These are like ${esc(d.title.title)} and free to borrow now.</b></div>
      <ul class="list">${n.suggestions.map((s) => `<li class="item">${cover(s)}<div class="grow">
        <div class="title">${esc(s.title)}</div><div class="muted small">${esc(s.why)}</div>
        <div class="small accent">${esc(s.level)} · ${esc(s.libraryName)}</div>
        <div class="actions" style="margin-top:6px">
          <button type="button" class="btn primary small" data-borrow-title="${s.titleId}">Borrow</button>
          <button type="button" class="btn ghost small" data-vote="up" data-suggested="${s.titleId}" aria-label="Good suggestion">Good pick</button>
          <button type="button" class="btn ghost small" data-vote="down" data-suggested="${s.titleId}" aria-label="Not a good suggestion">Not for us</button>
        </div></div></li>`).join('')}</ul>${excluded}`;
  }

  // ---------- approvals ----------
  async function viewApprovals() {
    if (isKid()) return '<p class="muted">Only parents review requests.</p>';
    const r = await call('GET', '/api/home');
    if (r.status !== 200) return errorBox(r);
    const pend = r.body.pendingApprovals;
    const ev = r.body.meetupRequests;
    return `<h1>Approvals</h1><p class="muted small">Books inside each kid's age band are approved automatically. You only see exceptions, and requests to go to events.</p>
      ${pend.length ? `<ul class="list">${pend.map((a) => `<li class="card">
        <div><b>${esc(nameOf(a.memberId))}</b> asked to borrow <b>${esc(a.title)}</b></div>
        <p class="small muted">${esc(a.reason)}</p>
        <div class="actions">
          <button type="button" class="btn primary small" data-decide="approve" data-approval="${a.id}">Approve this book</button>
          <button type="button" class="btn ghost small" data-decide="approve_series" data-approval="${a.id}">Approve the series</button>
          <button type="button" class="btn ghost small" data-decide="decline" data-approval="${a.id}">Not now</button>
        </div></li>`).join('')}</ul>` : ''}
      ${ev.length ? `<h2>Event requests</h2><ul class="list">${ev.map((q) => `<li class="card">
        <div><b>${esc(nameOf(q.by))}</b> wants to go to <b>${esc(q.title)}</b></div>
        <p class="small muted">${esc(when(q.startsAt))}. Approving books seats for ${esc(nameOf(q.by))} and you.</p>
        <div class="actions"><button type="button" class="btn primary small" data-rsvp-decide="approve" data-rsvp-id="${q.id}">Book it</button>
          <button type="button" class="btn ghost small" data-rsvp-decide="decline" data-rsvp-id="${q.id}">Not this time</button></div></li>`).join('')}</ul>` : ''}
      ${!pend.length && !ev.length ? '<div class="notice ok"><b>Nothing to review</b><span class="small">Switch to Arjun and ask for Deep Sea Detectives (record R5), or ask to go to an event, to see a request arrive.</span></div>' : ''}`;
  }

  async function viewDigest() {
    const r = await call('GET', '/api/digest');
    if (r.status !== 200) return errorBox(r);
    const d = r.body;
    const hrs = (m) => (m >= 60 ? `${(m / 60).toFixed(1).replace(/\.0$/, '')} h` : `${m} min`);
    return `<p class="muted small">Week ending ${esc(d.weekEnding)} · synthetic data</p>
      <h1>Your family finished ${plural(d.totals.booksFinished, 'book')}</h1>
      <div class="stats"><div class="stat"><b>${d.totals.booksFinished}</b><span class="small muted">books finished</span></div>
        <div class="stat"><b>${hrs(d.totals.minutes)}</b><span class="small muted">reading time</span></div>
        <div class="stat"><b>${Math.max(...d.members.map((m) => m.streak))}</b><span class="small muted">longest current streak</span></div></div>
      ${d.members.map((m) => `<div class="card"><div class="row"><span class="avatar ${m.role === 'kid' ? 'kid' : ''}" style="width:40px;height:40px;font-size:1rem">${esc(m.name[0])}</span>
        <div class="grow"><h3>${esc(m.name)}</h3><p class="small muted">${m.booksFinished} finished · ${hrs(m.minutes)} · read ${m.daysRead} of 7 days · ${m.streak}-day streak</p></div></div>
        ${m.streak === 0 && m.role === 'kid' ? `<p class="small">${esc(m.name)} could use a nudge: a bedtime chapter together starts a fresh streak.</p>` : ''}
        ${m.books.map((b) => `<div><b>${esc(b.title)}</b> ${b.reaction ? `<span class="pill kid">${esc(REACT[b.reaction])}</span>` : ''}
          ${m.role === 'kid' ? `<p class="small muted">Ask tonight: “${esc(b.prompt)}”</p>` : ''}</div>`).join('') || '<p class="small muted">No books finished this week.</p>'}
      </div>`).join('')}`;
  }

  async function viewLibrary() {
    const r = await call('GET', '/api/library');
    if (r.status !== 200) return errorBox(r);
    const libs = r.body.libraries;
    const health = await api.call('GET', '/api/health', {});
    const stripeMode = (health.body && health.body.stripe) || 'simulated';
    return `<h1>Payments</h1>
      <p class="muted small">Families never pay. When a series book has a long wait, the library can pay for an instant copy. Readaroo records each one as a Stripe usage charge and never spends past the library's cap. Stripe mode: <b>${esc(stripeMode)}</b>.</p>
      <div class="card"><h3>How the money moves</h3>
        <div class="flow">
          <div class="step"><b>1. Borrow instantly</b>A kid is mid-series and the wait is 4+ weeks.</div>
          <div class="step"><b>2. Budget check</b>Readaroo reserves the price under the library's daily and monthly cap, or says no.</div>
          <div class="step"><b>3. Stripe meter event</b>One usage charge per borrow, keyed <span class="mono">borrow:&lt;id&gt;</span> so retries never double charge.</div>
        </div>
        <p class="small muted">At month end, Stripe Billing can turn each library's meter total into an invoice ($0.01 per unit = 1 cent of usage).</p>
      </div>
      ${libs.map((l) => {
        const rows = l.meterEvents.map((m) => `<tr><td class="mono">${esc(m.stripeId)}</td><td>${esc(m.mode)}</td><td>${money(m.valueCents)}</td></tr>`).join('');
        const total = l.meterEvents.reduce((sum, m) => sum + m.valueCents, 0);
        return `<div class="card"><div class="row"><h3 class="grow">${esc(l.name)}</h3><span class="pill ${l.stripeConnected ? 'ok' : 'sky'}">${l.stripeConnected ? 'Stripe customer linked' : 'Simulated customer'}</span></div>
          <table class="invoice"><thead><tr><th>Usage charge</th><th>Mode</th><th>Amount</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="3" class="muted">No instant borrows yet in this demo. Try record R3.</td></tr>'}</tbody>
            <tfoot><tr><td colspan="2">Invoice preview from this demo</td><td>${money(total)}</td></tr></tfoot></table>
        </div>`;
      }).join('')}
      <h2>Budgets</h2><p class="muted small">Today is ${esc(r.body.today)}. Earlier spend this month came from other families.</p>
      ${libs.map((l) => {
        const dp = Math.min(100, Math.round((l.spentTodayCents / l.dailyCapCents) * 100));
        const mp = Math.min(100, Math.round((l.spentMonthCents / l.monthlyCapCents) * 100));
        return `<div class="card"><h3>${esc(l.name)}</h3>
          <div class="small">Today ${money(l.spentTodayCents)} of ${money(l.dailyCapCents)} ${dp >= 100 ? '<span class="pill bad">Cap reached</span>' : ''}</div>
          <div class="bar ${dp >= 100 ? 'full' : ''}" role="img" aria-label="${dp}% of daily cap used"><span style="width:${dp}%"></span></div>
          <div class="small">This month ${money(l.spentMonthCents)} of ${money(l.monthlyCapCents)}</div>
          <div class="bar" role="img" aria-label="${mp}% of monthly cap used"><span style="width:${mp}%"></span></div>
          <p class="small muted">${plural(l.meterEvents.length, 'metered instant borrow')} · ${l.refusals} refused at the cap · Stripe customer ${l.stripeConnected ? 'linked' : 'not linked (simulated)'}</p>
        </div>`;
      }).join('')}`;
  }

  async function guidePanel() {
    const [rec, ev, health] = await Promise.all([
      api.call('GET', '/api/demo-records', {}), call('GET', '/api/events'), api.call('GET', '/api/health', {}),
    ]);
    const records = rec.status === 200 ? rec.body.records : [];
    const events = ev.status === 200 ? ev.body.events : [];
    return `<div class="card"><div class="row"><h2 class="grow">Demo records</h2><span class="chip demo">Synthetic</span></div>
        <p class="small muted">Each record proves one behavior. Open it to jump in as the right family member.</p>
        ${records.map((r) => `<div class="record"><div class="row"><span class="rid">${esc(r.id)}</span><b class="grow">${esc(r.label)}</b>
          <button type="button" class="btn ghost small" data-record="${r.id}" data-title="${r.titleId || ''}" data-member="${r.memberId}" data-rview="${r.view || 'title'}" data-rborrow="${r.borrowId || ''}">Open</button></div>
          <span class="small muted">${esc(r.proves)}</span></div>`).join('')}
        <button type="button" class="btn ghost small" data-reset="1">Reset demo data</button>
      </div>
      <div class="card"><h2>Audit log</h2>
        <div class="log">${events.length ? events.map((e) => `<div><span class="type">${esc(e.type)}</span><span class="muted">${esc(nameOf(e.actor))} · ${esc(summary(e))}</span></div>`).join('') : '<p class="small muted">Every borrow, hold, approval, reading session, booking and charge appears here.</p>'}</div>
      </div>
      <footer>Mode: ${esc(health.body && health.body.mode)} · Stripe: ${esc(health.body && health.body.stripe)}</footer>`;
  }
  function summary(e) {
    const d = e.data || {};
    if (d.reason) return d.reason;
    if (d.priceCents) return money(d.priceCents);
    if (d.vote) return `${d.vote} on ${d.suggestedTitleId}`;
    if (d.minutes !== undefined && d.toPage !== undefined) return `${d.minutes} min, to page ${d.toPage}${d.retry ? ' (resaved)' : ''}`;
    if (d.status) return `${d.status}, ${(d.attendees || []).length} people`;
    if (d.kind && d.value) return `${d.kind} ${d.value}`;
    return d.titleId || d.meetupId || d.approvalId || '';
  }

  function errorBox(r) {
    return `<div class="notice bad"><b>Couldn't load this</b><span class="small">${esc((r.body && r.body.error) || 'Unknown error')}</span></div>`;
  }

  // ---------- render ----------
  async function render() {
    if (!state.members.length) {
      const h = await api.call('GET', '/api/home', { actor: state.actor });
      if (h.status === 200) state.members = h.body.members;
    }
    $('#actor').innerHTML = state.members.map((m) => `<option value="${m.id}" ${m.id === state.actor ? 'selected' : ''}>${esc(m.name)}${m.role === 'kid' ? ` (${m.age})` : ' (parent)'}</option>`).join('');
    const views = { home: viewHome, discover: viewDiscover, lists: viewLists, events: viewEvents, title: viewTitle, reader: viewReader, approvals: viewApprovals, digest: viewDigest, library: viewLibrary, guide: guidePanel, more: viewMore };
    document.body.classList.toggle('kid', isKid());
    const body = await (views[state.view] || viewHome)();
    const main = $('#main');
    main.classList.toggle('enter', state.animate);
    main.innerHTML = navBar() + body;
    state.animate = false;
    $('#guide').innerHTML = await guidePanel();
    $('#tabbar').innerHTML = tabBar();
  }

  async function act(method, path, body, after) {
    const r = await call(method, path, null, body);
    if (r.status >= 400) { toast((r.body && r.body.error) || 'Something went wrong.'); await render(); return r; }
    toast(r.body.message || 'Done.');
    celebrate(r.body);
    if (after) after(r.body);
    await render();
    return r;
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const box = b.getBoundingClientRect();
    state.lastClick = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    if (b.id === 'install') return installApp();
    const ds = b.dataset;
    if (ds.go) return go(ds.go);
    if (ds.actor) { state.actor = ds.actor; return go('home'); }
    if (ds.record) {
      state.actor = ds.member;
      if (ds.rview === 'reader') return go('reader', { borrowId: ds.rborrow });
      if (ds.rview === 'title') return go('title', { titleId: ds.title, member: ds.member });
      return go(ds.rview);
    }
    if (ds.read) { state.reader = null; return go('reader', { borrowId: ds.read }); }
    if (ds.listMember) return go('lists', { listMember: ds.listMember });
    if (ds.discoverMember) return go('discover', { discoverMember: ds.discoverMember });
    if (ds.clearSearch) { state.q = ''; return render(); }
    if (ds.title) return go('title', { titleId: ds.title, member: ds.member || state.actor });
    if (ds.reset) return act('POST', '/api/reset', {}, () => { state.view = 'home'; state.reader = null; });
    if (ds.page) {
      const rd = state.reader;
      rd.page = Math.max(0, Math.min(rd.pages, rd.page + Number(ds.page)));
      $('#rd-page').textContent = rd.page;
      const bar = b.closest('.reader').querySelector('.bar > span');
      if (bar) bar.style.width = `${Math.round((rd.page / rd.pages) * 100)}%`;
      return;
    }
    if (ds.reader) {
      const r = await flushReading(false, { finished: ds.reader === 'finished' });
      if (r && r.status >= 400) { toast(r.body.error); return; }
      toast(r ? r.body.message : 'Nothing to save yet: read for a bit first.');
      if (r) celebrate(r.body);
      state.reader = null;
      return go('home');
    }
    if (ds.act === 'borrow') return act('POST', '/api/borrow', { member: state.member, titleId: state.titleId });
    if (ds.act === 'hold') return act('POST', '/api/holds', { member: state.member, titleId: state.titleId });
    if (ds.act === 'instant') return act('POST', '/api/instant', { member: state.member, titleId: state.titleId });
    if (ds.act === 'refresh') return act('POST', '/api/refresh', { titleId: state.titleId });
    if (ds.borrowTitle) return act('POST', '/api/borrow', { member: ds.member || state.member, titleId: ds.borrowTitle });
    if (ds.prehold) return act('POST', '/api/holds', { member: ds.member, titleId: ds.prehold });
    if (ds.addList) return act('POST', '/api/tbr', { member: ds.member, titleId: ds.addList });
    if (ds.removeList) return act('POST', '/api/tbr/remove', { member: ds.member, titleId: ds.removeList });
    if (ds.follow) return act('POST', '/api/follow', { member: ds.member, kind: ds.follow, value: ds.value, on: ds.on !== 'false' });
    if (ds.vote) return act('POST', '/api/feedback', { heldTitleId: state.titleId, suggestedTitleId: ds.suggested, vote: ds.vote });
    if (ds.decide) return act('POST', `/api/approvals/${ds.approval}`, { decision: ds.decide });
    if (ds.rsvpDecide) return act('POST', `/api/rsvps/${ds.rsvpId}`, { decision: ds.rsvpDecide });
    if (ds.react) return act('POST', '/api/reactions', { borrowId: ds.borrow, reaction: ds.react });
    if (ds.askMeetup) return act('POST', `/api/meetups/${ds.askMeetup}/rsvp`, { attendees: [state.actor] });
    if (ds.cancelMeetup) return act('POST', `/api/meetups/${ds.cancelMeetup}/cancel`, {});
    if (ds.rsvp) {
      const ids = [...document.querySelectorAll(`input[name="att-${ds.rsvp}"]:checked`)].map((x) => x.value);
      if (!ids.length) { toast('Pick at least one person who is going.'); return; }
      return act('POST', `/api/meetups/${ds.rsvp}/rsvp`, { attendees: ids });
    }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'search-form') return;
    e.preventDefault();
    state.q = String(new FormData(e.target).get('q') || '').trim();
    render();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'actor') { state.actor = e.target.value; go('home'); }
  });

  // Brand mark and "Install app" (Android and desktop Chrome; iPhone uses Share > Add to Home Screen)
  $('#brand').insertAdjacentHTML('afterbegin', roo(''));
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; $('#install').hidden = false; });
  window.addEventListener('appinstalled', () => { $('#install').hidden = true; toast('Readaroo is on your home screen.'); confetti(90); });
  async function installApp() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    installEvent = null;
    $('#install').hidden = true;
  }

  try {
    const v = new URLSearchParams(location.search).get('view');
    if (['discover', 'events', 'lists', 'home'].includes(v)) state.view = v;
  } catch (e) { /* no query string support: start at home */ }
  render();
})();
