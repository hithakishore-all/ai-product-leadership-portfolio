// GTM Orbit · local server
//   Web console  http://localhost:3030  (account intelligence + AI workflow workspace)
//   Slack bot    starts too when SLACK_BOT_TOKEN and SLACK_APP_TOKEN are set in ../.env
//
//   npm start            live: reads/writes your Snowflake GTM_DEMO
//   npm run offline      offline snapshot (no Snowflake needed), same screens and flow
//   npm test             end-to-end smoke test in offline mode
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
if (process.argv.includes('--offline')) process.env.ORBIT_MOCK = '1';   // works on macOS, Linux and Windows
const express = require('express');
const engine = require('./lib/engine');
const { store } = engine;

const PORT = Number(process.env.ORBIT_PORT || 3030);
const HOST = process.env.ORBIT_HOST || '127.0.0.1';   // local only by default; the console has no login
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (!e.status) console.error('[orbit]', req.method, req.path, e.message);
  res.status(e.status || 500).json({ error: e.message });
});

// The web console acts as the account owner (the AE). If a Slack user is mapped as owner,
// the web uses that identity so the owner-only rule in Snowflake still passes.
async function actingUser(key) {
  const owner = key ? await store.ownerSlackId(key).catch(() => null) : null;
  return owner || 'web:ae';
}

const state = { slack: 'off', slackError: null, startedAt: new Date().toISOString() };

// Liveness for scripts and tests: 200 once the data store is ready.
app.get('/api/health', (_req, res) => res.json({ ok: true, data: store.mode, slack: state.slack, startedAt: state.startedAt }));

app.get('/api/status', wrap(async (_req, res) => {
  res.json({ data: store.mode, slack: state.slack, slackError: state.slackError, agents: 'scripted',
    port: PORT, account: process.env.SNOWFLAKE_ACCOUNT || null });
}));
app.get('/api/queue', wrap(async (_req, res) => res.json(await store.queue())));
app.get('/api/accounts/:key', wrap(async (req, res) => {
  const ctx = await store.context(req.params.key);
  if (!ctx) return res.status(404).json({ error: 'not found' });
  res.json(ctx);
}));
app.get('/api/accounts/:key/buying-group', wrap(async (req, res) => res.json(await engine.buyingGroup(req.params.key))));
app.post('/api/accounts/:key/defer', wrap(async (req, res) => {
  res.json(await store.recommendationAction(req.params.key, 'deferred', await actingUser(req.params.key), req.body.reason || 'Deferred from GTM Orbit'));
}));

app.post('/api/runs', wrap(async (req, res) => {
  if (!req.body || !req.body.account) return res.status(400).json({ error: 'account is required' });
  const job = await engine.startRun(req.body.account, await actingUser(req.body.account));
  res.json({ jobId: job.jobId });
}));
app.get('/api/runs/:jobId', wrap(async (req, res) => {
  const s = await engine.jobState(req.params.jobId);
  if (!s) return res.status(404).json({ error: 'unknown job' });
  res.json(s);
}));

app.get('/api/flows', wrap(async (_req, res) => res.json(await store.recentFlows())));
app.get('/api/flows/:id', wrap(async (req, res) => {
  const flow = await store.flow(req.params.id);
  if (!flow) return res.status(404).json({ error: 'unknown flow' });
  res.json(flow);
}));
app.get('/api/flows/:id/trace', wrap(async (req, res) => res.json(await store.trace(req.params.id))));
app.post('/api/flows/:id/actions', wrap(async (req, res) => {
  const flow = await store.flow(req.params.id);
  if (!flow) return res.status(404).json({ error: 'unknown flow' });
  const key = flow.PACKAGE && flow.PACKAGE.account.key;
  const { action, text } = req.body || {};
  if (!['edit', 'approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be edit, approve or reject' });
  if (action === 'edit' && !String(text || '').trim()) return res.status(400).json({ error: 'text is required for edit' });
  const idem = action === 'edit' ? `${req.params.id}:edit:${Date.now()}` : `${req.params.id}:${action}`;
  const r = await store.aeAction(req.params.id, action, await actingUser(key), text, idem);
  res.json({ ...r, flow: await store.flow(req.params.id) });
}));
app.post('/api/reset', wrap(async (_req, res) => { await store.reset(); res.json({ ok: true }); }));

// Live mode needs a Snowflake account and the bot's private key. Say exactly what is missing.
function preflight() {
  const problems = [];
  if (store.mode === 'live' && !process.env.SNOWFLAKE_ACCOUNT) problems.push('SNOWFLAKE_ACCOUNT is empty in .env (see docs/SETUP_SNOWFLAKE.md, step 6)');
  const key = path.resolve(__dirname, '..', process.env.SNOWFLAKE_PRIVATE_KEY_FILE || '.keys/gtm_slack_bot.p8');
  if (store.mode === 'live' && !fs.existsSync(key)) problems.push(`private key not found at ${key} (see docs/SETUP_SNOWFLAKE.md, step 5)`);
  if (!!process.env.SLACK_BOT_TOKEN !== !!process.env.SLACK_APP_TOKEN) problems.push('Slack needs both SLACK_BOT_TOKEN and SLACK_APP_TOKEN (or neither)');
  else if (process.env.SLACK_BOT_TOKEN && !process.env.SLACK_BOT_TOKEN.startsWith('xoxb-')) problems.push('SLACK_BOT_TOKEN should start with xoxb-');
  else if (process.env.SLACK_APP_TOKEN && !process.env.SLACK_APP_TOKEN.startsWith('xapp-')) problems.push('SLACK_APP_TOKEN should start with xapp-');
  return problems;
}

(async () => {
  const problems = preflight();
  if (problems.length) {
    console.error('\n[orbit] Setup is not complete yet:\n' + problems.map((p) => '  - ' + p).join('\n')
      + '\n\n  To try Orbit without any accounts, run: npm run offline\n');
    process.exit(1);
  }
  try {
    await store.init();
  } catch (e) {
    console.error(`\n[orbit] Could not connect to Snowflake: ${e.message}\n        Run offline instead with: npm run offline\n`);
    process.exit(1);
  }
  const server = app.listen(PORT, HOST, () => {
    console.log(`\n  GTM Orbit · ${store.mode === 'live' ? 'live Snowflake data' : 'offline snapshot'}`);
    console.log(`  Web console:  http://localhost:${server.address().port}`);
  });
  server.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE'
      ? `\n[orbit] Port ${PORT} is already in use. Stop the other process or set ORBIT_PORT in .env.\n`
      : `\n[orbit] ${e.message}\n`);
    process.exit(1);
  });
  const stop = () => { console.log('\n  GTM Orbit stopped.'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_APP_TOKEN) {
    try {
      await require('./lib/slack').start(engine);
      state.slack = 'on';
      console.log('  Slack bot:    on  (type /orbit in Slack)\n');
    } catch (e) {
      state.slack = 'error'; state.slackError = e.message;
      console.log(`  Slack bot:    error: ${e.message}\n`);
    }
  } else {
    console.log('  Slack bot:    off (add SLACK_BOT_TOKEN and SLACK_APP_TOKEN to .env to turn it on)\n');
  }
})();
