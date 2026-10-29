// The shared engine behind the web console and the Slack bot: one store (live Snowflake or offline
// snapshot), one place that starts agent runs and tracks their progress.
const store = process.env.ORBIT_MOCK === '1' ? require('./mock-store') : require('./snowflake-store');

const jobs = new Map(); // jobId -> {jobId, key, sfId, name, since, status, flowId, error, startedAt}
const runningByAccount = new Map();
let seq = 0;

const ROLE_HINTS = {
  champion: 'Director, Head of or Manager in the team that feels the problem',
  economic_buyer: 'VP Finance, CFO, Controller or the budget owner',
  technical_evaluator: 'IT Director, Enterprise Architect or Head of Engineering',
  executive_sponsor: 'VP or C-level owner of the business outcome',
};

async function resolveAccount(q) {
  const queue = await store.queue();
  const s = String(q || '').trim().toLowerCase();
  if (!s) return null;
  return queue.find((r) => r.ACCOUNT_KEY.toLowerCase() === s)
    || queue.find((r) => r.ACCOUNT_NAME.toLowerCase().startsWith(s))
    || queue.find((r) => r.ACCOUNT_NAME.toLowerCase().includes(s))
    || null;
}

// Missing-contact discovery: roles with no permitted contact, plus who exists but cannot be used.
const notFound = (key) => Object.assign(new Error(`unknown account ${key}`), { status: 404 });

async function buyingGroup(key) {
  const [ctx, listed] = await Promise.all([store.context(key), store.contacts(key).catch(() => null)]);
  if (!ctx) throw notFound(key);
  const rd = ctx.CONTACT_READINESS || {};
  // if the contacts view is not installed yet (09_orbit.sql), fall back to the permitted list in the context view
  const contacts = listed || (rd.permitted_contacts || []).map((p) => ({ ...p, permitted: true, opted_out: false, incomplete: false }));
  const missing = (rd.missing_roles || []).map((r) => ({ role: r, look_for: ROLE_HINTS[r] }));
  const blocked = contacts.filter((c) => !c.permitted).map((c) => ({ ...c,
    why: c.opted_out ? 'opted out of email' : c.incomplete ? 'record incomplete (no title or email)' : 'not permitted' }));
  return { account: ctx.ACCOUNT_NAME, key, roles_covered: rd.roles_covered, roles_total: rd.roles_total || 4,
    contacts, permitted: contacts.filter((c) => c.permitted), blocked, missing };
}

async function startRun(key, user) {
  if (runningByAccount.has(key)) return jobs.get(runningByAccount.get(key));
  const ctx = await store.context(key);
  if (!ctx) throw notFound(key);
  const job = { jobId: 'job_' + (++seq) + '_' + Date.now().toString(36), key, sfId: ctx.SALESFORCE_ACCOUNT_ID,
    name: ctx.ACCOUNT_NAME, since: await store.serverNow(), status: 'running', flowId: null, error: null, startedAt: Date.now() };
  jobs.set(job.jobId, job);
  runningByAccount.set(key, job.jobId);
  store.runFlow(key, user)
    .then((pkg) => { job.flowId = pkg.flow_id; job.status = 'done'; })
    .catch((e) => { job.status = 'error'; job.error = e.message; console.error('[orbit] run failed', e.message); })
    .finally(() => runningByAccount.delete(key));
  return job;
}

async function jobState(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  const events = await store.latestEvents(job.sfId, job.since).catch(() => []);
  if (!job.flowId && events[0]) job.flowId = events[0].FLOW_ID;
  const flow = job.status === 'done' ? await store.flow(job.flowId) : null;
  return { ...job, events, flow };
}

module.exports = { store, resolveAccount, buyingGroup, startRun, jobState, ROLE_HINTS };
