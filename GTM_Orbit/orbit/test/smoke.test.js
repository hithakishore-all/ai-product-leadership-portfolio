// End-to-end smoke test in offline mode: starts the real server on a free port and walks the
// whole workflow through the HTTP API (queue -> account -> buying group -> run -> edit -> approve -> trace).
// Run with: npm test   (no Snowflake, Salesforce or Slack needed)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

let proc, base;
const env = { ...process.env, ORBIT_MOCK: '1', ORBIT_PORT: '0', SLACK_BOT_TOKEN: '', SLACK_APP_TOKEN: '' };

before(async () => {
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise((resolve, reject) => {
    let out = '';
    const t = setTimeout(() => reject(new Error('server did not start:\n' + out)), 15000);
    const onData = (b) => {
      out += b;
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) { clearTimeout(t); resolve(`http://127.0.0.1:${m[1]}`); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('exit', (c) => reject(new Error(`server exited (${c}):\n${out}`)));
  });
});
after(() => proc && proc.kill('SIGTERM'));

const get = async (p) => { const r = await fetch(base + p); assert.equal(r.status, 200, p); return r.json(); };
const post = async (p, body) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  assert.equal(r.status, 200, p); return r.json();
};
async function runToEnd(key) {
  const { jobId } = await post('/api/runs', { account: key });
  for (let i = 0; i < 60; i++) {
    const s = await get('/api/runs/' + jobId);
    if (s.status !== 'running') return s;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('run did not finish');
}

test('health and status report offline mode', async () => {
  assert.equal((await get('/api/health')).ok, true);
  const s = await get('/api/status');
  assert.equal(s.data, 'offline');
  assert.equal(s.slack, 'off');
});

test('queue lists the 10 demo accounts, ranked', async () => {
  const q = await get('/api/queue');
  assert.equal(q.length, 10);
  assert.equal(q[0].ACCOUNT_NAME, 'Northstar Field Services');
});

test('unknown account returns 404', async () => {
  const r = await fetch(base + '/api/accounts/GTM-9999');
  assert.equal(r.status, 404);
});

test('buying group separates permitted, blocked and missing roles', async () => {
  const bg = await get('/api/accounts/GTM-0001/buying-group');
  assert.ok(bg.permitted.length > 0);
  assert.ok(bg.blocked.some((c) => c.why === 'opted out of email'), 'Northstar has an opted-out contact');
});

test('a full brief: validator catches the unsupported claim, then edit and approve', async () => {
  const s = await runToEnd('GTM-0001');
  assert.equal(s.status, 'done');
  const events = s.events.map((e) => e.EVENT);
  assert.ok(events.includes('crew.validator.failed'), 'validator rejected the first draft');
  assert.ok(events.includes('crew.validator.passed'), 'validator passed the rewrite');
  const flowId = s.flow.FLOW_ID;
  assert.ok(s.flow.PACKAGE.draft.body.length > 50);

  const edited = await post(`/api/flows/${flowId}/actions`, { action: 'edit', text: s.flow.CURRENT_DRAFT + '\n\nThanks!' });
  assert.equal(edited.ok, true);
  const approved = await post(`/api/flows/${flowId}/actions`, { action: 'approve' });
  assert.equal(approved.ok, true);
  assert.equal(approved.flow.STATE, 'approved');
  const again = await post(`/api/flows/${flowId}/actions`, { action: 'approve' });
  assert.equal(again.ok, false, 'approving twice is not allowed');

  const trace = await get(`/api/flows/${flowId}/trace`);
  assert.ok(trace.some((e) => e.EVENT === 'ae.approved'));
});

test('an account with no permitted contact stops without a draft', async () => {
  const q = await get('/api/queue');
  const verdant = q.find((r) => r.ACCOUNT_NAME.startsWith('Verdant'));
  const s = await runToEnd(verdant.ACCOUNT_KEY);
  assert.ok(s.events.some((e) => e.EVENT === 'crew.identifier.no_contact'));
  assert.ok(!s.flow.PACKAGE.draft, 'no draft is written');
});

test('reset clears runs', async () => {
  await post('/api/reset');
  assert.equal((await get('/api/flows')).length, 0);
});

test('bad input gets clear 4xx errors', async () => {
  assert.equal((await fetch(base + '/api/accounts/GTM-9999/buying-group')).status, 404);
  const noAcct = await fetch(base + '/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noAcct.status, 400);
  assert.equal((await fetch(base + '/api/flows/flow_nope')).status, 404);
});
