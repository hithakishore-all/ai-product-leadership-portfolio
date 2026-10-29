// GTM Orbit · Slack bot (Bolt, Socket Mode). Ask about an account, discover missing contacts,
// or get an outreach brief. Uses the same engine as the web console.
const { App } = require('@slack/bolt');
const ui = require('./slack-blocks');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function start(engine) {
  const { store } = engine;
  const app = new App({ token: process.env.SLACK_BOT_TOKEN, appToken: process.env.SLACK_APP_TOKEN, socketMode: true });

  async function denyUnlessOwner(client, channel, user, key) {
    let owner = await store.ownerSlackId(key);
    if (!owner) { await store.setOwnerSlackId(user).catch(() => {}); owner = user; } // first person to use Orbit becomes the AE/owner
    if (owner !== user) {
      await client.chat.postEphemeral({ channel, user, text: `Only the account owner (<@${owner}>) can act on this account.` });
      return true;
    }
    return false;
  }

  // Runs the Flow for an account and streams progress into one Slack message, then posts the brief.
  async function brief(client, channel, user, key) {
    if (await denyUnlessOwner(client, channel, user, key)) return;
    const job = await engine.startRun(key, user);
    const progress = await client.chat.postMessage({ channel, ...ui.progressMessage(job.name, []) });
    let last = -1, s;
    for (;;) {
      await sleep(1200);
      s = await engine.jobState(job.jobId);
      if (s.events.length !== last) {
        last = s.events.length;
        await client.chat.update({ channel, ts: progress.ts, ...ui.progressMessage(job.name, s.events, s.status === 'done') });
      }
      if (s.status !== 'running') break;
    }
    if (s.status === 'error') return client.chat.postMessage({ channel, text: `:warning: The flow failed: ${s.error}` });
    await client.chat.update({ channel, ts: progress.ts, ...ui.progressMessage(job.name, s.events, true) });
    await client.chat.postMessage({ channel, ...ui.reviewMessage(s.flow.PACKAGE, s.flow) });
  }

  async function handle(text, { channel, user, client, say }) {
    const [verb, ...rest] = String(text || '').trim().split(/\s+/);
    const arg = rest.join(' ');
    const v = (verb || 'queue').toLowerCase();
    if (v === 'help') return say(ui.helpMessage());
    if (v === 'queue' || v === 'today') return client.chat.postMessage({ channel, ...ui.queueMessage((await store.queue()).slice(0, 10)) });
    if (v === 'reset') { await store.reset(); return say('Demo runs cleared. Type `/orbit` to start again.'); }
    const acct = await engine.resolveAccount(['account', 'contacts', 'brief'].includes(v) ? arg : text);
    if (!acct) return say(`I couldn't find an account matching "${arg || text}". Try \`/orbit\` to see the queue.`);
    if (v === 'contacts') return client.chat.postMessage({ channel, ...ui.contactsMessage(await engine.buyingGroup(acct.ACCOUNT_KEY)) });
    if (v === 'brief') return brief(client, channel, user, acct.ACCOUNT_KEY);
    const [ctx, bg] = await Promise.all([store.context(acct.ACCOUNT_KEY), engine.buyingGroup(acct.ACCOUNT_KEY)]);
    return client.chat.postMessage({ channel, ...ui.accountMessage(ctx, bg) });
  }

  app.command('/orbit', async ({ ack, command, client, respond }) => {
    await ack();
    const say = (m) => respond(typeof m === 'string' ? { text: m } : m);
    try { await handle(command.text, { channel: command.channel_id, user: command.user_id, client, say }); }
    catch (e) { console.error(e); await respond(`:warning: ${e.message}`); }
  });

  app.event('app_mention', async ({ event, client, say }) => {
    const text = event.text.replace(/<@[^>]+>/g, '').trim();
    try { await handle(text, { channel: event.channel, user: event.user, client, say }); }
    catch (e) { console.error(e); await say(`:warning: ${e.message}`); }
  });

  // Replace the clicked row on the queue card with a status line
  function markRow(body, key, text) {
    const blocks = body.message.blocks.map((b) =>
      (b.type === 'actions' && b.elements.some((e) => e.value === key && e.action_id === 'accept_account')
        ? { type: 'context', elements: [{ type: 'mrkdwn', text }] } : b));
    return { channel: body.channel.id, ts: body.message.ts, text: body.message.text, blocks };
  }

  app.action('accept_account', async ({ ack, body, client }) => {
    await ack();
    const key = body.actions[0].value;
    try {
      if (body.message.text && body.message.text.startsWith('GTM Orbit · today')) {
        await client.chat.update(markRow(body, key, `:white_check_mark: Accepted by <@${body.user.id}> · Orbit is preparing the brief below`));
      }
      await brief(client, body.channel.id, body.user.id, key);
    } catch (e) { console.error(e); await client.chat.postMessage({ channel: body.channel.id, text: `:warning: ${e.message}` }); }
  });

  app.action('show_contacts', async ({ ack, body, client }) => {
    await ack();
    await client.chat.postMessage({ channel: body.channel.id, ...ui.contactsMessage(await engine.buyingGroup(body.actions[0].value)) });
  });

  app.action('defer_account', async ({ ack, body, client }) => {
    await ack();
    const key = body.actions[0].value;
    await store.recommendationAction(key, 'deferred', body.user.id, 'Deferred from Slack');
    await client.chat.update(markRow(body, key, `:double_vertical_bar: Deferred by <@${body.user.id}> · logged`));
  });

  async function refresh(client, channel, ts, flowId, decision) {
    const flow = await store.flow(flowId);
    await client.chat.update({ channel, ts, ...ui.reviewMessage(flow.PACKAGE, flow, decision) });
  }
  async function act(client, channel, user, flowId, action, text, key) {
    const r = await store.aeAction(flowId, action, user, text, key);
    if (!r.ok && !r.duplicate) await client.chat.postEphemeral({ channel, user, text: r.reason });
    return r.ok;
  }

  app.action('approve_package', async ({ ack, body, client }) => {
    await ack();
    const flowId = body.actions[0].value;
    if (await act(client, body.channel.id, body.user.id, flowId, 'approve', '', `${flowId}:approve`)) {
      await refresh(client, body.channel.id, body.message.ts, flowId, { user: body.user.id });
    }
  });
  app.action('edit_package', async ({ ack, body, client }) => {
    await ack();
    const flow = await store.flow(body.actions[0].value);
    await client.views.open({ trigger_id: body.trigger_id, view: ui.editModal(flow.FLOW_ID, flow.CURRENT_DRAFT, body.channel.id, body.message.ts) });
  });
  app.view('edit_submit', async ({ ack, view, body, client }) => {
    await ack();
    const { flowId, channel, ts } = JSON.parse(view.private_metadata);
    if (await act(client, channel, body.user.id, flowId, 'edit', view.state.values.draft.body.value, `${flowId}:edit:${view.id}:${view.hash}`)) {
      await refresh(client, channel, ts, flowId);
    }
  });
  app.action('reject_package', async ({ ack, body, client }) => {
    await ack();
    await client.views.open({ trigger_id: body.trigger_id, view: ui.rejectModal(body.actions[0].value, body.channel.id, body.message.ts) });
  });
  app.view('reject_submit', async ({ ack, view, body, client }) => {
    await ack();
    const { flowId, channel, ts } = JSON.parse(view.private_metadata);
    const reason = view.state.values.reason.text.value;
    if (await act(client, channel, body.user.id, flowId, 'reject', reason, `${flowId}:reject`)) {
      await refresh(client, channel, ts, flowId, { user: body.user.id, reason });
    }
  });
  app.action('view_trace', async ({ ack, body, client }) => {
    await ack();
    const flowId = body.actions[0].value;
    await client.chat.postMessage({ channel: body.channel.id, thread_ts: body.message.ts, ...ui.traceMessage(flowId, await store.trace(flowId)) });
  });

  await app.start();
  return app;
}

module.exports = { start };
