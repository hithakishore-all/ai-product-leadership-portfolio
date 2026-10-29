// GTM Orbit · Slack Block Kit cards.
const md = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const ctx = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });
const divider = { type: 'divider' };
const btn = (text, action_id, value, style) => ({ type: 'button', text: { type: 'plain_text', text }, action_id, value, ...(style ? { style } : {}) });
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const quote = (s) => esc(s).split('\n').map((l) => '>' + l).join('\n');

const FRESH = { fresh: ':large_green_circle: fresh', stale: ':large_yellow_circle: stale', unscored: ':white_circle: not scored' };
const ROLE = { champion: 'likely champion', economic_buyer: 'possible economic buyer', technical_evaluator: 'technical evaluator', executive_sponsor: 'executive sponsor' };
const score = (s) => (s == null ? '—' : Number(s).toFixed(2));

function unknownInputs(fs) {
  return Object.entries(fs || {}).filter(([, v]) => v !== 'present').map(([k, v]) => `${k} ${v.toUpperCase()}`);
}

// 1. The daily ranked queue
function queueMessage(rows) {
  const blocks = [
    md(':ringed_planet: *GTM Orbit · today\'s accounts*\n_Every account has a next move._ Ranked by the approved scoring model. Accept one and Orbit prepares an outreach brief for your review. Nothing is sent.'),
    divider,
  ];
  for (const r of rows) {
    const unk = unknownInputs(r.FEATURE_STATUS);
    const missing = (r.MISSING_ROLES || []).map((m) => m.replace('_', ' ')).join(', ');
    blocks.push(md(
      `*${r.QUEUE_RANK}. ${esc(r.ACCOUNT_NAME)}*  ·  priority *${score(r.PRIORITY_SCORE)}*  ·  ${FRESH[r.SCORE_FRESHNESS] || r.SCORE_FRESHNESS}\n` +
      `${esc(r.SCORE_RATIONALE)}`));
    blocks.push(ctx(
      `${esc(r.INDUSTRY)} · ${r.REGION} · Growth vector: *${esc(r.GROWTH_VECTOR)}* · Contacts: ${r.ROLES_COVERED}/4 roles` +
      (missing ? ` (missing ${missing})` : '') + (unk.length ? ` · :grey_question: ${unk.join(', ')}` : '') +
      ` · \`${r.SCORE_VERSION || 'unscored'}\``));
    blocks.push({ type: 'actions', elements: [
      btn('Prepare brief', 'accept_account', r.ACCOUNT_KEY, 'primary'),
      btn('Contacts', 'show_contacts', r.ACCOUNT_KEY),
      btn('Defer', 'defer_account', r.ACCOUNT_KEY),
    ] });
  }
  blocks.push(ctx('Unscored or stale accounts are flagged, never treated as low priority. Score weights belong to the model owner.'));
  return { text: "GTM Orbit · today's accounts", blocks };
}

// 2. Live progress while the Flow runs
const STEPS = [
  ['context', 'Load governed context', 'Snowflake · ACCOUNT_CONTEXT_V'],
  ['identifier', 'Discover', 'sequence + permitted contacts'],
  ['researcher', 'Research', 'facts, each cited'],
  ['composer', 'Compose', 'draft from cited facts only'],
  ['validator', 'Validate', 'claims, policy, completeness'],
];

function progressMessage(accountName, events, done = false) {
  const has = (e) => events.some((x) => x.EVENT === e);
  const lines = [];
  const status = {
    context: has('context.loaded') ? 'done' : 'run',
    identifier: has('crew.identifier.done') || has('crew.identifier.no_contact') ? 'done' : has('context.loaded') ? 'run' : 'wait',
    researcher: has('crew.researcher.done') ? 'done' : has('crew.identifier.done') ? 'run' : 'wait',
    composer: events.filter((e) => e.EVENT === 'crew.composer.done').length ? 'done' : has('crew.researcher.done') ? 'run' : 'wait',
    validator: has('crew.validator.passed') ? 'done' : has('crew.validator.escalated') ? 'flag' : events.some((e) => e.EVENT === 'crew.composer.done') ? 'run' : 'wait',
  };
  if (has('crew.identifier.no_contact')) { status.identifier = 'flag'; status.researcher = status.composer = status.validator = 'skip'; }
  const icon = { done: ':white_check_mark:', run: ':hourglass_flowing_sand:', wait: ':white_circle:', flag: ':warning:', skip: ':heavy_minus_sign:' };
  for (const [key, label, sub] of STEPS) {
    let extra = '';
    if (key === 'identifier') {
      const e = events.find((x) => x.EVENT === 'crew.identifier.done');
      if (e) extra = ` → ${e.DETAIL.sequence} · ${(e.DETAIL.contacts || []).join(', ').replace(/_/g, ' ')}`;
      if (has('crew.identifier.no_contact')) extra = ' → *no permitted contact*';
    }
    if (key === 'researcher') {
      const e = events.find((x) => x.EVENT === 'crew.researcher.done');
      if (e) extra = ` → ${e.DETAIL.facts} cited facts`;
    }
    if (key === 'composer') {
      const n = events.filter((x) => x.EVENT === 'crew.composer.done').length;
      if (n) extra = ` → draft v${n}`;
    }
    lines.push(`${icon[status[key]]} *${label}* · _${sub}_${extra}`);
    if (key === 'validator') {
      for (const f of events.filter((x) => x.EVENT === 'crew.validator.failed')) {
        lines.push(`      :x: Flagged unsupported claim: _"${esc((f.DETAIL.flagged_claims || []).join('", "'))}"_ → sent back to Compose (retry ${f.DETAIL.retry} of ${f.DETAIL.max_retries})`);
      }
      if (has('crew.validator.passed')) lines.push('      :white_check_mark: Every claim maps to evidence');
    }
  }
  lines.push(`${done ? ':bust_in_silhouette:' : icon.wait} *Human approval* · _you edit, approve or reject_${done ? ' → waiting for you' : ''}`);
  const flowId = events[0] && events[0].FLOW_ID;
  return {
    text: `Preparing ${accountName}`,
    blocks: [
      md(`${done ? ':package:' : ':ringed_planet:'} *${done ? 'Brief ready for human approval' : 'Orbit is preparing an outreach brief'} · ${esc(accountName)}*`),
      md(lines.join('\n')),
      ctx(`Discover → Research → Compose → Validate → Human approval · \`${flowId || 'starting…'}\` · state: *${done ? 'awaiting_ae' : 'crew_running'}* · nothing is sent`),
    ],
  };
}

// 3. The review package
function reviewMessage(pkg, flow, decision) {
  const a = pkg.account, s = pkg.score;
  const blocks = [];
  const stateIcon = { awaiting_ae: ':memo:', approved: ':white_check_mark:', rejected: ':no_entry_sign:' }[flow.STATE] || ':memo:';
  blocks.push({ type: 'header', text: { type: 'plain_text', text: `Outreach brief · ${a.name}` } });
  blocks.push(md(
    `*Priority* ${score(s.priority_score)} · ${FRESH[s.freshness] || s.freshness} · \`${s.version || 'unscored'}\` · Growth vector *${esc(pkg.growth_vector)}*\n` +
    `*Why now:* ${esc(pkg.research_summary || s.rationale)}`));
  if ((pkg.warnings || []).length) blocks.push(ctx(':warning: ' + pkg.warnings.map(esc).join(' · ')));

  if (pkg.status === 'no_permitted_contact') {
    blocks.push(divider, md(`:no_entry: *${esc(pkg.gap)}*\nThe Identifier will not pick an opted-out contact, so the Composer never ran. Next step is a human one: find a permitted contact or wait for the RFP.`));
  } else {
    const contacts = (pkg.contacts || []).map((c) =>
      `• *${esc(c.name)}* · ${esc(c.title)} · ${ROLE[c.role] || c.role} · confidence *${Number(c.confidence).toFixed(2)}*${c.contact_id === pkg.primary_contact_id ? ' · _first email_' : ''}`).join('\n');
    const missing = (pkg.contact_readiness?.missing_roles || []).map((m) => m.replace('_', ' ')).join(', ');
    blocks.push(divider, md(`*Sequence* \`${pkg.sequence}\`\n*Contacts*\n${contacts}` + (missing ? `\n_Gap: ${missing} not covered by a permitted contact_` : '')));
    blocks.push(md('*Evidence used*\n' + (pkg.facts || []).map((f) => `\`${f.ref_id}\` ${esc(f.fact).slice(0, 180)}`).join('\n')));
    const d = pkg.draft || {};
    blocks.push(divider, md(`*Draft v${flow.DRAFT_VERSION || d.version}* · Subject: *${esc(d.subject)}*\n${quote(flow.CURRENT_DRAFT || d.body)}`));
    const v = pkg.validator || {};
    const caught = pkg.retries ? `caught and removed an unsupported claim on draft v1 (${pkg.retries} retr${pkg.retries === 1 ? 'y' : 'ies'})` : 'passed on the first draft';
    blocks.push(ctx(`:shield: Validator ${v.passed ? caught : ':warning: needs manual review: ' + esc((v.reasons || []).join('; '))} · ${v.word_count} words · claims mapped to evidence: ${(pkg.claims || []).map((c) => '`' + c.ref_id + '`').join(' ')}`));
  }

  if (flow.STATE === 'awaiting_ae') {
    const els = [];
    if (pkg.status !== 'no_permitted_contact') {
      els.push(btn('Approve', 'approve_package', flow.FLOW_ID, 'primary'), btn('Edit draft', 'edit_package', flow.FLOW_ID));
    }
    els.push(btn('Reject', 'reject_package', flow.FLOW_ID, 'danger'), btn('View audit trail', 'view_trace', flow.FLOW_ID));
    blocks.push({ type: 'actions', elements: els });
  } else {
    blocks.push(md(`${stateIcon} *${flow.STATE === 'approved' ? 'Approved' : 'Rejected'}* by <@${decision?.user}>` +
      (flow.STATE === 'approved' ? ' · draft v' + flow.DRAFT_VERSION + ' recorded. *Nothing was sent*: delivery is a separate, permissioned step.' : '') +
      (decision?.reason ? ` · reason: _${esc(decision.reason)}_` : '')));
    blocks.push({ type: 'actions', elements: [btn('View audit trail', 'view_trace', flow.FLOW_ID)] });
  }
  blocks.push(ctx(`GTM Orbit · flow \`${flow.FLOW_ID}\` · agents: ${esc(pkg.model)} · data: Salesforce + Gong (simulated) + Snowflake signals`));
  return { text: `Outreach brief · ${a.name}`, blocks };
}

function traceMessage(flowId, rows) {
  const lines = rows.map((r) => {
    const t = String(r.TS).slice(11, 19);
    const lvl = { WARN: ':warning:', HUMAN: ':bust_in_silhouette:' }[r.LEVEL] || ':small_blue_diamond:';
    const det = r.DETAIL || {};
    const extra = det.flagged_claims ? ` · flagged: _${det.flagged_claims.join('; ')}_` : det.reason ? ` · ${det.reason}` : '';
    return `\`${t}\` ${lvl} \`${r.EVENT}\` · ${r.ACTOR}${r.DURATION_MS != null ? ` · ${r.DURATION_MS} ms` : ''}${esc(extra)}`;
  });
  return { text: `Audit trail ${flowId}`, blocks: [md(`*Audit trail* · \`${flowId}\`\n` + lines.join('\n')), ctx('Every step writes one event to GTM_DEMO.APP.AUDIT_EVENTS.')] };
}

function editModal(flowId, text, channel, ts) {
  return {
    type: 'modal', callback_id: 'edit_submit', private_metadata: JSON.stringify({ flowId, channel, ts }),
    title: { type: 'plain_text', text: 'Edit draft' }, submit: { type: 'plain_text', text: 'Save edit' },
    blocks: [{ type: 'input', block_id: 'draft', label: { type: 'plain_text', text: 'Email body' },
      element: { type: 'plain_text_input', action_id: 'body', multiline: true, initial_value: text || '' } },
    ctx('Your edit is saved as a new draft version and logged. It is not sent.')],
  };
}

function rejectModal(flowId, channel, ts) {
  return {
    type: 'modal', callback_id: 'reject_submit', private_metadata: JSON.stringify({ flowId, channel, ts }),
    title: { type: 'plain_text', text: 'Reject package' }, submit: { type: 'plain_text', text: 'Reject' },
    blocks: [{ type: 'input', block_id: 'reason', label: { type: 'plain_text', text: 'Why? (helps tune the workflow)' },
      element: { type: 'plain_text_input', action_id: 'text', multiline: true } }],
  };
}


// Account brief: /orbit account <name>
function accountMessage(ctx, bg) {
  const fs = unknownInputs(ctx.FEATURE_STATUS);
  const ev = (ctx.EVIDENCE || []).slice(0, 5).map((e) => `\`${e.ref_id}\` ${esc(e.excerpt).slice(0, 150)}`).join('\n');
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: ctx.ACCOUNT_NAME } },
    md(`*Priority* ${score(ctx.PRIORITY_SCORE)} · ${FRESH[ctx.SCORE_FRESHNESS] || ctx.SCORE_FRESHNESS} · \`${ctx.SCORE_VERSION || 'unscored'}\` · Growth vector *${esc(ctx.GROWTH_VECTOR)}*\n${esc(ctx.SCORE_RATIONALE)}`),
    ctx_(`${esc(ctx.INDUSTRY)} · ${ctx.REGION} · owner ${esc(ctx.OWNER_NAME)}` + (fs.length ? ` · :grey_question: ${fs.join(', ')}` : '')),
    divider,
    md(`*Latest signals*\n${ev || '_none_'}`),
    md(`*Buying group* · ${bg.roles_covered}/${bg.roles_total} roles covered by a permitted contact` +
      (bg.missing.length ? `\n_Missing: ${bg.missing.map((m) => m.role.replace('_', ' ')).join(', ')}_` : '')),
    { type: 'actions', elements: [
      btn('Prepare outreach brief', 'accept_account', ctx.ACCOUNT_KEY, 'primary'),
      btn('Discover contacts', 'show_contacts', ctx.ACCOUNT_KEY),
    ] },
  ];
  return { text: `GTM Orbit · ${ctx.ACCOUNT_NAME}`, blocks };
}

// Missing-contact discovery: /orbit contacts <name>
function contactsMessage(bg) {
  const ok = bg.permitted.map((c) => `• *${esc(c.name)}* · ${esc(c.title)} · ${ROLE[c.role_hypothesis] || 'role unknown'}`).join('\n') || '_none_';
  const blocked = bg.blocked.map((c) => `• ${esc(c.name)} · ${esc(c.title || 'no title')} · _${c.why}_`).join('\n');
  const missing = bg.missing.map((m) => `• *${m.role.replace('_', ' ')}*: look for ${esc(m.look_for)}`).join('\n');
  const blocks = [
    md(`:busts_in_silhouette: *Buying group · ${esc(bg.account)}* · ${bg.roles_covered}/${bg.roles_total} roles covered`),
    md(`*Can be contacted*\n${ok}`),
  ];
  if (blocked) blocks.push(md(`*In Salesforce but not usable*\n${blocked}`));
  blocks.push(md(missing ? `*Missing roles to find*\n${missing}` : ':white_check_mark: All four buying roles are covered.'));
  blocks.push(ctx_('Roles are hypotheses from job titles. Orbit never suggests an opted-out contact. Finding new people is a human step.'));
  return { text: `Buying group · ${bg.account}`, blocks };
}

function helpMessage() {
  return { text: 'GTM Orbit help', blocks: [
    md(':ringed_planet: *GTM Orbit* · _Every account has a next move. Orbit helps you find it._'),
    md('`/orbit` or `/orbit queue` · today\'s ranked accounts\n`/orbit account <name>` · ask about an account\n`/orbit contacts <name>` · discover missing contacts\n`/orbit brief <name>` · get an outreach brief (Discover → Research → Compose → Validate → Human approval)\n`/orbit reset` · clear demo runs\nYou can also mention me: _@GTM Orbit brief Northstar_'),
  ] };
}

const ctx_ = ctx;
module.exports = { queueMessage, progressMessage, reviewMessage, traceMessage, editModal, rejectModal, accountMessage, contactsMessage, helpMessage };
