// Offline store: replays the snapshot in mock/fixtures.json (built from your real Salesforce export,
// the Snowflake seeds and the deployed RUN_ACTIVATION_FLOW code). Same interface as snowflake-store.js.
const fs = require('fs');
const path = require('path');

const FX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mock', 'fixtures.json'), 'utf8'));
const clone = (o) => (o === undefined ? null : JSON.parse(JSON.stringify(o)));
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 23);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let flows = new Map();    // flow_id -> flow row
let audit = [];           // {FLOW_ID, TS, LEVEL, EVENT, ACTOR, DURATION_MS, DETAIL, ACCOUNT_ID}
let seen = new Set();
let ownerSlack = null;

const DELAY = { 'crew.identifier.done': 1100, 'crew.researcher.done': 1100, 'crew.composer.done': 1100,
  'crew.validator.failed': 700, 'crew.validator.passed': 700, 'crew.identifier.no_contact': 800 };

function newFlowId() { return 'flow_' + Math.random().toString(16).slice(2, 8); }

module.exports = {
  mode: 'offline',
  async init() {},
  async queue() { return clone(FX.queue); },
  async context(key) { return clone(FX.contexts[key]); },
  async contacts(key) { return clone(FX.contacts[key] || []); },
  async ownerSlackId() { return ownerSlack; },
  async setOwnerSlackId(id) { ownerSlack = id; },

  // Runs the pre-computed agent run with realistic pacing, writing events as it goes.
  async runFlow(key, user) {
    if (!FX.runs[key]) throw Object.assign(new Error(`unknown account ${key}`), { status: 404 });
    const run = clone(FX.runs[key]);
    const flowId = newFlowId();
    const ctx = FX.contexts[key];
    const pkg = { ...run.package, flow_id: flowId };
    const flow = { FLOW_ID: flowId, ACCOUNT_ID: ctx.SALESFORCE_ACCOUNT_ID, ACCOUNT_KEY: key, STATE: 'received', RETRIES: 0,
      DRAFT_VERSION: 0, CURRENT_DRAFT: null, PACKAGE: null, CREATED_AT: now(), UPDATED_AT: now() };
    flows.set(flowId, flow);
    let composed = 0;
    for (const ev of run.events) {
      const wait = DELAY[ev.EVENT] || 180;
      await sleep(wait);
      if (ev.DURATION_MS === 0) ev.DURATION_MS = wait + Math.floor(Math.random() * 90);
      if (ev.EVENT === 'ae.accepted') ev.ACTOR = 'user:' + user;
      audit.push({ FLOW_ID: flowId, TS: now(), ACCOUNT_ID: ctx.SALESFORCE_ACCOUNT_ID, ACCOUNT_NAME: ctx.ACCOUNT_NAME, SCORE_VERSION: ctx.SCORE_VERSION, ...ev });
      if (ev.EVENT.startsWith('flow.state.')) flow.STATE = ev.EVENT.slice(11);
      if (ev.EVENT === 'crew.composer.done') { composed += 1; flow.DRAFT_VERSION = composed; }
      if (ev.EVENT === 'crew.validator.failed') flow.RETRIES = ev.DETAIL.retry;
      flow.UPDATED_AT = now();
    }
    flow.PACKAGE = pkg;
    flow.CURRENT_DRAFT = pkg.draft ? pkg.draft.body : null;
    return pkg;
  },

  async latestEvents(salesforceId, since) {
    const f = [...flows.values()].filter((x) => x.ACCOUNT_ID === salesforceId && x.CREATED_AT >= since)
      .sort((a, b) => (a.CREATED_AT < b.CREATED_AT ? 1 : -1))[0];
    return f ? clone(audit.filter((e) => e.FLOW_ID === f.FLOW_ID)) : [];
  },

  async flow(flowId) { const f = flows.get(flowId); return f ? clone(f) : null; },

  async recentFlows() {
    return [...flows.values()].sort((a, b) => (a.CREATED_AT < b.CREATED_AT ? 1 : -1)).slice(0, 20).map((f) => ({
      FLOW_ID: f.FLOW_ID, ACCOUNT_KEY: f.ACCOUNT_KEY, ACCOUNT_NAME: FX.contexts[f.ACCOUNT_KEY].ACCOUNT_NAME, STATE: f.STATE,
      RETRIES: f.RETRIES, DRAFT_VERSION: f.DRAFT_VERSION, STATUS: f.PACKAGE ? f.PACKAGE.status : null, UPDATED_AT: f.UPDATED_AT }));
  },

  async aeAction(flowId, action, user, text, key) {
    key = key || `${flowId}:${action}:${text || ''}`;
    if (seen.has(key)) return { ok: false, duplicate: true };
    seen.add(key);
    const f = flows.get(flowId);
    if (!f) return { ok: false, reason: 'unknown flow' };
    if (ownerSlack && user !== ownerSlack && !String(user).startsWith('web')) return { ok: false, reason: 'Only the account owner can act on this package' };
    if (['approved', 'rejected'].includes(f.STATE)) return { ok: false, reason: `Flow already ${f.STATE}` };
    let event;
    if (action === 'edit') {
      f.DRAFT_VERSION += 1; f.CURRENT_DRAFT = text;
      f.PACKAGE.draft = { ...f.PACKAGE.draft, body: text, version: f.DRAFT_VERSION, edited_by: user };
      event = 'ae.edited';
    } else if (action === 'approve') { f.STATE = 'approved'; event = 'ae.approved'; }
    else if (action === 'reject') { f.STATE = 'rejected'; event = 'ae.rejected'; }
    else return { ok: false, reason: 'unknown action ' + action };
    f.UPDATED_AT = now();
    audit.push({ FLOW_ID: flowId, TS: now(), LEVEL: 'HUMAN', EVENT: event, ACTOR: 'user:' + user, DURATION_MS: null,
      ACCOUNT_ID: f.ACCOUNT_ID, ACCOUNT_NAME: FX.contexts[f.ACCOUNT_KEY].ACCOUNT_NAME,
      DETAIL: { level: 'HUMAN', draft_version: f.DRAFT_VERSION, reason: action === 'reject' ? text : undefined,
        note: action === 'approve' ? 'Nothing is sent. Delivery is out of scope.' : undefined } });
    return { ok: true, state: f.STATE, draft_version: f.DRAFT_VERSION };
  },

  async recommendationAction(key, action, user, reason) {
    const c = FX.contexts[key];
    audit.push({ FLOW_ID: null, TS: now(), LEVEL: 'HUMAN', EVENT: 'ae.recommendation.' + action, ACTOR: 'user:' + user,
      ACCOUNT_ID: c.SALESFORCE_ACCOUNT_ID, ACCOUNT_NAME: c.ACCOUNT_NAME, DURATION_MS: null, DETAIL: { level: 'HUMAN', reason } });
    return { ok: true, action };
  },

  async trace(flowId) { return clone(audit.filter((e) => e.FLOW_ID === flowId)); },
  async serverNow() { return now(); },
  async reset() { flows = new Map(); audit = []; seen = new Set(); return 'reset'; },
};
