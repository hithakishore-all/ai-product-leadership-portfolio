// GTM Orbit · web console
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (path, opts = {}) => {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const score = (s) => (s == null ? 'n/a' : Number(s).toFixed(2));
const ROLE = { champion: 'Champion', economic_buyer: 'Economic buyer', technical_evaluator: 'Technical evaluator', executive_sponsor: 'Executive sponsor' };
const FRESH = { fresh: 'Fresh', stale: 'Stale', unscored: 'Not scored' };
const fmtDate = (ts) => { if (!ts) return ''; const d = new Date(String(ts).replace(' ', 'T')); return isNaN(d) ? String(ts).slice(0, 10) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

const STAGES = [
  { id: 'discover', name: 'Discover', what: 'who to contact and which sequence' },
  { id: 'research', name: 'Research', what: 'facts from Salesforce, Gong and usage, each cited' },
  { id: 'compose', name: 'Compose', what: 'a first email from cited facts only' },
  { id: 'validate', name: 'Validate', what: 'every claim checked against evidence' },
  { id: 'human', name: 'Human approval', what: 'you edit, approve or reject' },
];

const S = { queue: [], key: null, ctx: null, bg: null, tab: 'signals', job: null, flow: null, trailFlow: null, runs: [] };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ------------------------------------------------------------------ status + queue
async function loadStatus() {
  const s = await api('/api/status');
  $('#status').innerHTML =
    `<span class="pill ${s.data === 'live' ? 'ok' : 'warn'}">${s.data === 'live' ? 'Snowflake live' : 'Offline snapshot'}</span>` +
    `<span class="pill ${s.slack === 'on' ? 'ok' : s.slack === 'error' ? 'err' : ''}" title="${esc(s.slackError || '')}">Slack ${s.slack === 'on' ? 'connected' : s.slack === 'error' ? 'error' : 'off'}</span>` +
    `<span class="pill" title="Snowflake trial accounts have no AI functions, so agent wording is pre-written. Flow, checks and approvals are real.">Agents: scripted wording</span>`;
}

function renderQueue() {
  const q = $('#search').value.trim().toLowerCase();
  const rows = S.queue.filter((r) => !q || r.ACCOUNT_NAME.toLowerCase().includes(q));
  $('#queue').innerHTML = rows.map((r) => {
    const unk = Object.values(r.FEATURE_STATUS || {}).filter((v) => v !== 'present').length;
    return `<li><button class="qitem" type="button" data-key="${r.ACCOUNT_KEY}" aria-current="${r.ACCOUNT_KEY === S.key}">
      <span class="qrank">${r.QUEUE_RANK}</span>
      <span class="qname">${esc(r.ACCOUNT_NAME)}</span>
      <span class="qscore">${score(r.PRIORITY_SCORE)}</span>
      <span class="qmeta"><span class="tag ${r.SCORE_FRESHNESS}">${FRESH[r.SCORE_FRESHNESS]}</span>
        <span class="tag">${esc(r.GROWTH_VECTOR)}</span>
        <span class="tag ${r.ROLES_COVERED === 0 ? 'gap' : ''}">${r.ROLES_COVERED}/4 roles</span>
        ${unk ? `<span class="tag stale">${unk} input${unk > 1 ? 's' : ''} missing</span>` : ''}</span>
    </button></li>`;
  }).join('') || '<li class="sub" style="padding:12px">No account matches that search.</li>';
}

// ------------------------------------------------------------------ the orbit
function orbitSVG(name, states) {
  const C = 180, R = 128, circ = 2 * Math.PI * R;
  let done = 0; while (done < 5 && states[done] === 'done') done += 1;   // consecutive finished stages
  const activeIdx = states.findIndex((s) => s === 'active' || s === 'flag');
  const pos = activeIdx >= 0 ? activeIdx : Math.min(done, 4);
  // the arc runs from Discover to the furthest stage reached; stages sit 72 degrees apart
  const furthest = states.reduce((m, s, i) => (['done', 'wait-human', 'active', 'flag'].includes(s) ? i : m), -1);
  const reach = done === 5 ? 1 : states[0] === 'flag' ? 0 : Math.max(0, furthest) / 5;
  const ang = (i) => (-90 + i * 72) * Math.PI / 180;
  const lines = wrapName(name);
  const nodes = STAGES.map((st, i) => {
    const x = C + R * Math.cos(ang(i)), y = C + R * Math.sin(ang(i));
    const cs = Math.cos(ang(i)), lx = C + (R + 24) * cs, ly = C + (R + 24) * Math.sin(ang(i)) + 4;
    const anchor = cs > 0.3 ? 'start' : cs < -0.3 ? 'end' : 'middle';
    return `<g class="node ${states[i]}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11"/>
      <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" style="text-anchor:${anchor}">${st.name}</text></g>`;
  }).join('');
  const sat = ang(pos);
  return `<svg class="orbit" viewBox="-100 8 560 344" role="img" aria-label="Workflow for ${esc(name)}: ${STAGES.map((s, i) => s.name + ' ' + (states[i] || 'waiting')).join(', ')}">
    <circle class="ring" cx="${C}" cy="${C}" r="${R}"/>
    <circle class="ring-live" cx="${C}" cy="${C}" r="${R}" transform="rotate(-90 ${C} ${C})"
      stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - reach)).toFixed(1)}" opacity="${furthest > 0 ? 1 : 0}"/>
    <circle class="core" cx="${C}" cy="${C}" r="66"/>
    ${lines.map((l, i) => `<text class="core-name" x="${C}" y="${C - (lines.length - 1) * 8 + i * 16}">${esc(l)}</text>`).join('')}
    <text class="core-sub" x="${C}" y="${C + lines.length * 8 + 14}">next move</text>
    ${nodes}
    <circle class="satellite" cx="${(C + R * Math.cos(sat)).toFixed(1)}" cy="${(C + R * Math.sin(sat)).toFixed(1)}" r="4.5" opacity="${activeIdx >= 0 ? 1 : 0}"/>
  </svg>`;
}
function wrapName(n) {
  const words = n.split(' '); const out = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 13 && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur);
  return out.slice(0, 3);
}

// stage states from audit events (+ final flow)
function stageStates(events, flow) {
  const has = (e) => events.some((x) => x.EVENT === e);
  const st = ['', '', '', '', ''];
  if (!events.length) return st;
  const noContact = has('crew.identifier.no_contact');
  st[0] = has('crew.identifier.done') || noContact ? (noContact ? 'flag' : 'done') : 'active';
  if (noContact) { st[1] = st[2] = st[3] = 'skip'; }
  else {
    st[1] = has('crew.researcher.done') ? 'done' : st[0] === 'done' ? 'active' : '';
    const composed = events.filter((e) => e.EVENT === 'crew.composer.done').length;
    const failed = events.filter((e) => e.EVENT === 'crew.validator.failed').length;
    // compose is re-entered after each validator failure
    st[2] = composed === 0 ? (st[1] === 'done' ? 'active' : '') : composed > failed ? 'done' : 'active';
    st[3] = has('crew.validator.passed') ? 'done' : has('crew.validator.escalated') ? 'flag'
      : failed && failed >= composed ? 'flag' : composed > failed ? 'active' : '';
  }
  if (has('flow.state.awaiting_ae')) st[4] = flow && ['approved', 'rejected'].includes(flow.STATE) ? 'done' : 'wait-human';
  return st;
}

// ------------------------------------------------------------------ workspace
async function selectAccount(key) {
  S.key = key; renderQueue();
  $('#workspace').innerHTML = '<div class="empty">Loading account…</div>';
  const [ctx, bg] = await Promise.all([api(`/api/accounts/${key}`), api(`/api/accounts/${key}/buying-group`)]);
  S.ctx = ctx; S.bg = bg;
  const latest = S.runs.find((r) => r.ACCOUNT_KEY === key);
  if (S.job && S.job.key === key) { /* keep live run */ }
  else if (latest) { await showFlow(latest.FLOW_ID); }
  else { S.flow = null; S.job = null; renderBriefIdle(); }
  renderWorkspace();
  history.replaceState(null, '', '#' + key);
}

function renderWorkspace() {
  const c = S.ctx; if (!c) return;
  const events = S.job ? S.job.events || [] : S.flowEvents || [];
  const states = stageStates(events, S.flow);
  const unknown = Object.entries(c.FEATURE_STATUS || {});
  const running = S.job && S.job.status === 'running';
  const hasBrief = S.flow && S.flow.PACKAGE && S.flow.PACKAGE.account.key === c.ACCOUNT_KEY;
  $('#workspace').innerHTML = `
    <div class="acct-head">
      <div><h1 class="acct-name">${esc(c.ACCOUNT_NAME)}</h1>
        <p class="acct-facts">${esc(c.INDUSTRY)}, ${esc(c.REGION)}${c.BILLING_CITY ? ', ' + esc(c.BILLING_CITY) : ''}. ${esc(c.ACCOUNT_TYPE || '')}. Owner ${esc(c.OWNER_NAME)}.</p></div>
      <div class="score-block"><div class="score-big">${score(c.PRIORITY_SCORE)}</div>
        <div class="score-label">priority, ${FRESH[c.SCORE_FRESHNESS].toLowerCase()}${c.SCORE_AGE_DAYS != null ? `, scored ${c.SCORE_AGE_DAYS === 0 ? 'today' : c.SCORE_AGE_DAYS + ' days ago'}` : ''}<br><span class="mono">${esc(c.SCORE_VERSION || '')}</span></div></div>
    </div>
    <p class="why">${esc(c.SCORE_RATIONALE)}</p>
    <div class="inputs">${unknown.map(([k, v]) => `<span class="tag ${v === 'present' ? '' : 'unknown'}" title="Model input ${k}: ${v}">${k.replace('_', '/')} ${v === 'present' ? '' : v}</span>`).join('')}
      <span class="tag">Growth vector: ${esc(c.GROWTH_VECTOR)}</span></div>

    <div class="orbit-wrap">
      ${orbitSVG(c.ACCOUNT_NAME, states)}
      <div class="orbit-side">
        <h3>${running ? 'Orbit is preparing a brief' : hasBrief ? briefHeadline() : 'Next move: prepare an outreach brief'}</h3>
        <p>${running ? 'Each stage lights up as its agent finishes. Watch Validate: it checks every claim against evidence and sends unsupported ones back.'
          : hasBrief && S.flow.PACKAGE.status === 'no_permitted_contact' ? 'Every contact at this account opted out, so Orbit did not write a draft. Finding a permitted contact is a human step; see Buying group below.'
          : hasBrief && S.flow.STATE === 'approved' ? 'Approved and recorded with its draft and score version. Nothing was sent: delivery is a separate, permissioned step.'
          : hasBrief && S.flow.STATE === 'rejected' ? 'Rejected. Your reason is in the audit trail so the workflow can be tuned.'
          : hasBrief ? 'The brief is in the panel on the right. Edit, approve or reject it; nothing is sent either way.'
          : `Orbit will pick permitted contacts, pull cited facts from ${c.EVIDENCE.length} signals, write a first email and validate it before you see it.`}</p>
        <button class="primary" type="button" id="runBtn" ${running ? 'disabled' : ''}>${running ? 'Preparing…' : hasBrief ? 'Prepare a new brief' : 'Prepare outreach brief'}</button>
        <button class="ghost" type="button" id="deferBtn" ${running ? 'disabled' : ''}>Defer account</button>
      </div>
    </div>

    <div class="tabs" role="tablist">
      ${[['signals', `Signals (${c.EVIDENCE.length})`], ['buying', `Buying group (${S.bg.roles_covered}/4)`], ['inputs', 'Score and inputs']]
        .map(([id, label]) => `<button class="tab" role="tab" type="button" data-tab="${id}" aria-selected="${S.tab === id}">${label}</button>`).join('')}
    </div>
    <div class="tabpanel" role="tabpanel">${S.tab === 'signals' ? signalsTab(c) : S.tab === 'buying' ? buyingTab(S.bg) : inputsTab(c)}</div>`;
}

function briefHeadline() {
  const f = S.flow;
  if (f.STATE === 'approved') return 'Brief approved';
  if (f.STATE === 'rejected') return 'Brief rejected';
  if (f.PACKAGE.status === 'no_permitted_contact') return 'Stopped: no permitted contact';
  return 'Brief ready for your approval';
}

function signalsTab(c) {
  return `<ul class="ev">${c.EVIDENCE.map((e) => `<li>
    <div><div class="src src-${e.source}">${esc(e.source)}</div><div class="date">${fmtDate(e.ts)}</div></div>
    <div><div>${esc(e.excerpt)}</div><div class="ref">${esc(e.ref_id)}</div></div></li>`).join('')}</ul>`;
}

function buyingTab(bg) {
  const covered = new Set(bg.permitted.map((p) => p.role_hypothesis));
  const roles = Object.keys(ROLE).map((r) => {
    const who = bg.permitted.filter((p) => p.role_hypothesis === r).map((p) => p.name).join(', ');
    return `<div class="role ${covered.has(r) ? 'covered' : 'missing'}"><b>${ROLE[r]}</b><span>${covered.has(r) ? esc(who) : 'Not covered'}</span></div>`;
  }).join('');
  const rows = bg.contacts.map((p) => `<tr class="${p.permitted ? '' : 'blocked'}"><td>${esc(p.name)}</td><td>${esc(p.title || 'No title')}</td>
    <td>${p.role_hypothesis ? ROLE[p.role_hypothesis] : 'Unknown'}</td>
    <td>${p.permitted ? 'Can be contacted' : p.opted_out ? 'Opted out of email' : 'Record incomplete'}</td></tr>`).join('');
  const missing = bg.missing.length ? `<div class="hint"><b>Missing contacts to find</b><ul>${bg.missing.map((m) => `<li>${ROLE[m.role]}: look for ${esc(m.look_for)}</li>`).join('')}</ul></div>` : '';
  return `<div class="roles">${roles}</div>${missing}
    <table class="people"><thead><tr><th>Name</th><th>Title</th><th>Likely role</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="sub" style="margin-top:8px">Roles are hypotheses from job titles. Orbit never picks an opted-out contact.</p>`;
}

function inputsTab(c) {
  const fs = Object.entries(c.FEATURE_STATUS || {}).map(([k, v]) => `<dt>${k.replace('_', '/')}</dt><dd>${v === 'present' ? 'Input to the model' : v === 'unknown' ? 'Unknown, shown as unknown and never as zero' : 'Not scored yet'}</dd>`).join('');
  return `<dl class="kv"><dt>Priority score</dt><dd>${score(c.PRIORITY_SCORE)} (${esc(c.SCORE_VERSION || 'unscored')})</dd>
    <dt>Freshness</dt><dd>${FRESH[c.SCORE_FRESHNESS]}${c.SCORED_AT ? ', scored ' + fmtDate(c.SCORED_AT) : ''}</dd>${fs}
    <dt>Weights and calibration</dt><dd>Owned by the scoring model's owner. Orbit reads the score; it never computes or changes it.</dd>
    <dt>Allowed sequences</dt><dd>${(c.ALLOWED_SEQUENCES || []).map((s) => `<span class="mono">${esc(s)}</span>`).join(', ')}</dd></dl>`;
}

// ------------------------------------------------------------------ brief panel
function renderBriefIdle() {
  $('#briefBody').innerHTML = `<p class="muted">Orbit prepares a brief in five steps for <b>${esc(S.ctx ? S.ctx.ACCOUNT_NAME : 'the selected account')}</b>.</p>
    <ol class="steps">${STAGES.map((s) => `<li class="step"><span class="dot"></span><span><b>${s.name}</b>: ${s.what}</span></li>`).join('')}</ol>
    <p class="sub" style="margin-top:12px">Nothing is ever sent. Delivery is a separate, permissioned step.</p>`;
}

function stepsHTML(events, flow) {
  const st = stageStates(events, flow);
  const ev = (n) => events.find((x) => x.EVENT === n);
  const out = [];
  const ident = ev('crew.identifier.done');
  out[0] = ev('crew.identifier.no_contact') ? '<span class="flagline">No permitted contact. Every contact opted out, so Orbit stops here.</span>'
    : ident ? `<span class="out">${esc(ident.DETAIL.sequence)}: ${esc((ident.DETAIL.contacts || []).join(', ').replace(/_/g, ' '))}</span>` : '';
  const res = ev('crew.researcher.done');
  out[1] = res ? `<span class="out">${res.DETAIL.facts} cited facts${res.DETAIL.dropped_uncited ? `, ${res.DETAIL.dropped_uncited} uncited dropped` : ''}</span>` : '';
  const comps = events.filter((x) => x.EVENT === 'crew.composer.done').length;
  out[2] = comps ? `<span class="out">Draft v${comps}</span>` : '';
  out[3] = events.filter((x) => x.EVENT === 'crew.validator.failed').map((f) =>
    `<span class="flagline">Caught an unsupported claim: “${esc((f.DETAIL.flagged_claims || []).join('”, “'))}”. Sent back to Compose (retry ${f.DETAIL.retry} of ${f.DETAIL.max_retries}).</span>`).join('')
    + (ev('crew.validator.passed') ? '<span class="passline">Every claim maps to evidence.</span>' : '')
    + (ev('crew.validator.escalated') ? '<span class="flagline">Still unsupported after 2 retries. Marked for manual review.</span>' : '');
  out[4] = st[4] === 'wait-human' ? '<span class="out">Waiting for you</span>' : '';
  return `<ol class="steps">${STAGES.map((s, i) => `<li class="step ${st[i]}"><span class="dot"></span><span><b>${s.name}</b></span>${out[i] || ''}</li>`).join('')}</ol>`;
}

function renderRunning() {
  const j = S.job;
  $('#briefBody').innerHTML = `<p class="muted">Preparing a brief for <b>${esc(j.name)}</b>.</p>${stepsHTML(j.events || [], null)}
    <p class="sub" style="margin-top:10px"><span class="mono">${esc(j.flowId || 'starting')}</span></p>`;
}

function renderReview() {
  const f = S.flow, p = f.PACKAGE;
  const warn = (p.warnings || []).length ? `<div class="warn">${p.warnings.map(esc).join('<br>')}</div>` : '';
  const steps = stepsHTML(S.flowEvents || [], f);
  if (p.status === 'no_permitted_contact') {
    $('#briefBody').innerHTML = `${warn}<div class="stop"><b>Orbit stopped before writing a draft.</b><br>${esc(String(p.gap || '').replace(' No draft was written.', ''))}<br>Next step is a human one: find a permitted contact, or wait for the RFP.</div>
      ${decisionHTML(f)}${steps}`;
    return;
  }
  const contacts = (p.contacts || []).map((c) => `<div class="contact"><span><b>${esc(c.name)}</b>${c.contact_id === p.primary_contact_id ? ' · first email' : ''}</span>
    <span class="conf" title="Confidence in the role">${Number(c.confidence).toFixed(2)}</span><small>${esc(c.title)}, ${ROLE[c.role] || c.role}</small></div>`).join('');
  const missing = (p.contact_readiness?.missing_roles || []).map((r) => ROLE[r]).join(', ');
  const v = p.validator || {};
  const open = f.STATE === 'awaiting_ae';
  $('#briefBody').innerHTML = `${warn}
    <div class="section"><h3>Why now</h3><p>${esc(p.research_summary || p.score.rationale)}</p></div>
    <div class="section"><h3>Who to contact</h3>${contacts}${missing ? `<p class="sub">Not covered: ${esc(missing)}</p>` : ''}
      <p class="sub">Sequence <span class="mono">${esc(p.sequence)}</span></p></div>
    <div class="section"><h3>Draft v${f.DRAFT_VERSION}</h3><p class="subject">${esc(p.draft.subject)}</p>
      <label class="sr" for="draft">Email draft</label>
      <textarea id="draft" class="draft" ${open ? '' : 'readonly'}>${esc(f.CURRENT_DRAFT || p.draft.body)}</textarea>
      <div class="claims">${(p.claims || []).map((c) => `<span class="mono" title="${esc(c.claim)}">${esc(c.ref_id)}</span>`).join('')}</div>
      <div class="verdict ${v.passed ? '' : 'bad'}">${v.passed ? (p.retries ? `Validated. Removed ${p.retries === 1 ? 'an unsupported claim' : 'unsupported claims'} from the first draft.` : 'Validated on the first draft.') : 'Needs manual review: ' + esc((v.reasons || []).join('; '))} ${v.word_count} words.</div></div>
    ${open ? `<div class="actions"><button class="primary" id="approveBtn" type="button">Approve brief</button><button class="ghost" id="saveBtn" type="button" disabled>Save edit</button><button class="danger" id="rejectBtn" type="button">Reject</button></div>` : decisionHTML(f)}
    <details class="section"><summary>How Orbit got here</summary>${steps}</details>
    <details class="section"><summary>Evidence used (${(p.facts || []).length})</summary>${(p.facts || []).map((x) => `<p style="margin-top:6px"><span class="mono">${esc(x.ref_id)}</span><br>${esc(x.fact)}</p>`).join('')}</details>`;
}

function decisionHTML(f) {
  if (f.STATE === 'approved') return `<div class="decided approved"><b>Approved.</b> Draft v${f.DRAFT_VERSION} is recorded with score version ${esc(f.PACKAGE.score.version)}. Nothing was sent: delivery is a separate, permissioned step.</div>`;
  if (f.STATE === 'rejected') return '<div class="decided rejected"><b>Rejected.</b> Your reason is logged to tune the workflow.</div>';
  if (f.PACKAGE.status === 'no_permitted_contact') return '<div class="actions"><button class="danger" id="rejectBtn" type="button">Reject with a reason</button></div>';
  return '';
}

async function showFlow(flowId) {
  const [flow, trace] = await Promise.all([api(`/api/flows/${flowId}`), api(`/api/flows/${flowId}/trace`)]);
  S.flow = flow; S.flowEvents = trace; S.job = null; S.trailFlow = flowId;
  renderReview(); renderTrail(trace);
}

// ------------------------------------------------------------------ run
async function runBrief() {
  const key = S.ctx.ACCOUNT_KEY;
  S.flow = null; S.flowEvents = [];
  const { jobId } = await api('/api/runs', { method: 'POST', body: { account: key } });
  S.job = { jobId, key, name: S.ctx.ACCOUNT_NAME, status: 'running', events: [] };
  renderWorkspace(); renderRunning();
  for (;;) {
    await sleep(700);
    const j = await api(`/api/runs/${jobId}`);
    S.job = { ...S.job, ...j };
    if (S.key === key) { renderWorkspace(); }
    renderRunning(); renderTrail(j.events, j.flowId);
    if (j.status !== 'running') break;
  }
  if (S.job.status === 'error') { toast('The run failed: ' + S.job.error); S.job = null; renderWorkspace(); return; }
  await loadRuns();
  await showFlow(S.job.flowId);
  if (S.key === key) renderWorkspace();
}

async function act(action, text) {
  const r = await api(`/api/flows/${S.flow.FLOW_ID}/actions`, { method: 'POST', body: { action, text } });
  if (!r.ok && !r.duplicate) { toast(r.reason || 'That action was not allowed'); return; }
  await showFlow(S.flow.FLOW_ID); await loadRuns(); renderWorkspace();
  toast({ approve: 'Brief approved. Nothing was sent.', edit: 'Edit saved as a new draft version.', reject: 'Brief rejected. Reason logged.' }[action]);
}

// ------------------------------------------------------------------ audit trail
async function loadRuns() {
  S.runs = await api('/api/flows');
  $('#runs').innerHTML = S.runs.map((r) => `<button class="run-chip" role="tab" type="button" data-flow="${r.FLOW_ID}" aria-selected="${r.FLOW_ID === S.trailFlow}">${esc(r.ACCOUNT_NAME)}: ${esc(r.STATE.replace('_', ' '))}</button>`).join('');
}
function renderTrail(rows, flowId) {
  if (flowId) S.trailFlow = flowId;
  $('#trailSub').innerHTML = S.trailFlow ? `Run <span class="mono">${esc(S.trailFlow)}</span>. Every step writes one event to Snowflake.` : 'Every step writes one event to Snowflake. Pick a run to see it.';
  $('#trail tbody').innerHTML = (rows || []).map((e) => {
    const d = e.DETAIL || {};
    const detail = d.flagged_claims ? 'Flagged: ' + d.flagged_claims.join('; ') : d.contacts ? d.contacts.join(', ').replace(/_/g, ' ')
      : d.refs ? d.refs.join(', ') : d.reason ? d.reason : d.note ? d.note : d.evidence != null ? `${d.evidence} evidence items, ${d.permitted_contacts} permitted contacts, ${d.freshness}` : d.account || '';
    return `<tr class="${e.LEVEL || ''}"><td class="t">${esc(String(e.TS || '').slice(11, 19))}</td><td>${esc(e.ACTOR)}</td><td class="evt">${esc(e.EVENT)}</td><td>${esc(detail)}</td><td class="num">${e.DURATION_MS ?? ''}</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="sub">No events yet.</td></tr>';
  document.querySelectorAll('.run-chip').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.flow === S.trailFlow)));
}

// ------------------------------------------------------------------ events
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button'); if (!t) return;
  try {
    if (t.classList.contains('qitem')) return selectAccount(t.dataset.key);
    if (t.dataset.tab) { S.tab = t.dataset.tab; return renderWorkspace(); }
    if (t.id === 'runBtn') return runBrief();
    if (t.id === 'deferBtn') { await api(`/api/accounts/${S.key}/defer`, { method: 'POST', body: {} }); return toast(`${S.ctx.ACCOUNT_NAME} deferred. Logged.`); }
    if (t.id === 'approveBtn') return act('approve');
    if (t.id === 'saveBtn') return act('edit', $('#draft').value);
    if (t.id === 'rejectBtn') { $('#rejectReason').value = ''; return $('#rejectDialog').showModal(); }
    if (t.classList.contains('run-chip')) {
      const r = S.runs.find((x) => x.FLOW_ID === t.dataset.flow);
      if (r && r.ACCOUNT_KEY !== S.key) await selectAccount(r.ACCOUNT_KEY);
      await showFlow(t.dataset.flow); return renderWorkspace();
    }
    if (t.id === 'resetBtn') {
      await api('/api/reset', { method: 'POST' }); S.flow = null; S.job = null; S.trailFlow = null; S.flowEvents = [];
      await loadRuns(); renderTrail([]); renderBriefIdle(); renderWorkspace(); return toast('Demo runs cleared.');
    }
  } catch (err) { toast(err.message); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'search') renderQueue();
  if (e.target.id === 'draft') { const b = $('#saveBtn'); if (b) b.disabled = e.target.value === (S.flow.CURRENT_DRAFT || ''); }
});
$('#rejectDialog').addEventListener('close', () => {
  if ($('#rejectDialog').returnValue === 'ok' && $('#rejectReason').value.trim()) act('reject', $('#rejectReason').value.trim());
});

(async () => {
  try {
    await loadStatus();
    S.queue = await api('/api/queue');
    renderQueue();
    await loadRuns();
    const start = location.hash.slice(1) || (S.queue[0] && S.queue[0].ACCOUNT_KEY);
    if (start) await selectAccount(start);
  } catch (err) {
    $('#workspace').innerHTML = `<div class="empty">Orbit could not load data: ${esc(err.message)}. Check the terminal where Orbit is running.</div>`;
  }
})();
