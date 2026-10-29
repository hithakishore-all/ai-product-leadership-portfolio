// Live store: GTM_DEMO in your Snowflake, as the GTM_SLACK_BOT service user (key pair, role GTM_APP_RW).
// That role can read the contract views and call the flow procedures. It cannot read raw tables.
const fs = require('fs');
const path = require('path');
const snowflake = require('snowflake-sdk');

snowflake.configure({ logLevel: 'ERROR' });
const ROOT = path.resolve(__dirname, '..', '..');   // the gtm-ai-demo folder

function connect() {
  const conn = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_BOT_USER || 'GTM_SLACK_BOT',
    authenticator: 'SNOWFLAKE_JWT',
    privateKey: fs.readFileSync(path.resolve(ROOT, process.env.SNOWFLAKE_PRIVATE_KEY_FILE || '.keys/gtm_slack_bot.p8'), 'utf8'),
    role: 'GTM_APP_RW', warehouse: 'GTM_DEMO_WH', database: 'GTM_DEMO', schema: 'APP',
    clientSessionKeepAlive: true,
  });
  return new Promise((resolve, reject) => conn.connect((err, c) => (err ? reject(err) : resolve(c))));
}

let main, poller, worker;
const run = (conn, sqlText, binds = []) => new Promise((resolve, reject) =>
  conn.execute({ sqlText, binds, complete: (err, _s, rows) => (err ? reject(err) : resolve(rows || [])) }));
const json = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);
const first = (rows) => rows[0] && json(Object.values(rows[0])[0]);
const parse = (r, keys) => { for (const k of keys) if (k in r) r[k] = json(r[k]); return r; };

module.exports = {
  mode: 'live',
  async init() { [main, poller, worker] = await Promise.all([connect(), connect(), connect()]); },

  queue: () => run(main, 'SELECT * FROM RANKED_QUEUE_V ORDER BY QUEUE_RANK')
    .then((rows) => rows.map((r) => parse(r, ['FEATURE_STATUS', 'MISSING_ROLES']))),
  context: (key) => run(main, 'SELECT * FROM ACCOUNT_CONTEXT_V WHERE ACCOUNT_KEY = ?', [key])
    .then((r) => r[0] && parse(r[0], ['FEATURE_STATUS', 'CONTACT_READINESS', 'EVIDENCE', 'ALLOWED_SEQUENCES'])),
  contacts: (key) => run(main, 'SELECT * FROM ACCOUNT_CONTACTS_V WHERE ACCOUNT_KEY = ? ORDER BY PERMITTED DESC, NAME', [key])
    .then((rows) => rows.map((r) => ({ contact_id: r.CONTACT_ID, name: r.NAME, title: r.TITLE, email: r.EMAIL,
      role_hypothesis: r.ROLE_HYPOTHESIS, opted_out: r.OPTED_OUT, do_not_call: r.DO_NOT_CALL, permitted: r.PERMITTED,
      incomplete: r.INCOMPLETE }))),
  ownerSlackId: (key) => run(main, `SELECT d.SLACK_USER_ID FROM RANKED_QUEUE_V q JOIN AE_DIRECTORY d ON d.SF_USER_ID = q.OWNER_ID
      WHERE q.ACCOUNT_KEY = ?`, [key]).then((r) => (r[0] ? r[0].SLACK_USER_ID : null)),
  setOwnerSlackId: (id) => run(main, 'CALL SET_OWNER_SLACK_ID(?)', [id]),

  runFlow: (key, user) => run(worker, 'CALL RUN_ACTIVATION_FLOW(?, ?)', [key, user]).then(first),
  latestEvents: (sfId, since) => run(poller,
    `SELECT EVENT, LEVEL, ACTOR, DURATION_MS, DETAIL, FLOW_ID, TO_VARCHAR(TS, 'YYYY-MM-DD HH24:MI:SS.FF3') AS TS FROM FLOW_TRACE_V
      WHERE FLOW_ID = (SELECT FLOW_ID FROM FLOW_RUNS WHERE ACCOUNT_ID = ? AND CREATED_AT >= ?::TIMESTAMP_NTZ
                       ORDER BY CREATED_AT DESC LIMIT 1) ORDER BY TS`, [sfId, since])
    .then((rows) => rows.map((r) => parse(r, ['DETAIL']))),
  flow: (flowId) => run(main, 'SELECT * FROM FLOW_RUNS WHERE FLOW_ID = ?', [flowId]).then((r) => r[0] && parse(r[0], ['PACKAGE'])),
  recentFlows: () => run(main, `SELECT FLOW_ID, PACKAGE:account:key::STRING AS ACCOUNT_KEY, PACKAGE:account:name::STRING AS ACCOUNT_NAME,
      STATE, RETRIES, DRAFT_VERSION, PACKAGE:status::STRING AS STATUS, TO_VARCHAR(UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT
      FROM FLOW_RUNS WHERE PACKAGE IS NOT NULL ORDER BY CREATED_AT DESC LIMIT 20`),
  aeAction: (flowId, action, user, text, key) => run(main, 'CALL AE_ACTION(?, ?, ?, ?, ?)', [flowId, action, user, text || '', key]).then(first),
  recommendationAction: (key, action, user, reason) => run(main, 'CALL RECOMMENDATION_ACTION(?, ?, ?, ?)', [key, action, user, reason || '']).then(first),
  trace: (flowId) => run(main, `SELECT TO_VARCHAR(TS, 'YYYY-MM-DD HH24:MI:SS.FF3') AS TS, LEVEL, EVENT, ACTOR, DURATION_MS, DETAIL, ACCOUNT_NAME
      FROM FLOW_TRACE_V WHERE FLOW_ID = ? ORDER BY TS`, [flowId]).then((rows) => rows.map((r) => parse(r, ['DETAIL']))),
  serverNow: () => run(poller, "SELECT TO_VARCHAR(CURRENT_TIMESTAMP()::TIMESTAMP_NTZ, 'YYYY-MM-DD HH24:MI:SS.FF3') AS T").then((r) => r[0].T),
  reset: () => run(main, 'CALL RESET_DEMO()'),
};
