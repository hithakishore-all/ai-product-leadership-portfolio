# GTM Orbit app

The web console and Slack bot. The full guide is in the [main README](../README.md).

```bash
npm ci
npm run offline   # no accounts needed: http://localhost:3030
npm start         # live Snowflake data (see ../docs/SETUP_SNOWFLAKE.md)
npm test          # end-to-end smoke test
```

The Slack bot starts automatically when `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` are set in `../.env`
(see [../docs/SETUP_SLACK.md](../docs/SETUP_SLACK.md)).

| File | Purpose |
| --- | --- |
| `server.js` | Web server, JSON API, configuration checks, starts the Slack bot |
| `lib/engine.js` | Shared engine: account lookup, buying group, runs and progress |
| `lib/snowflake-store.js` | Live data as `GTM_SLACK_BOT` (key pair, role `GTM_APP_RW`) |
| `lib/mock-store.js` | Offline data from `mock/fixtures.json` (same interface) |
| `lib/slack.js`, `lib/slack-blocks.js` | Slack commands, buttons, modals and layouts |
| `public/` | Web console (no build step) |
| `slack-manifest.yml` | Slack app definition |
| `test/smoke.test.js` | End-to-end test in offline mode |
