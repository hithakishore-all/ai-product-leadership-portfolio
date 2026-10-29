# Troubleshooting

Find your symptom below. When in doubt, run `npm run offline`: if that works, the issue is in your Snowflake or
Slack setup, not in the app.

[← Back to README](../README.md)

## Install and start

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm: command not found` / `node: command not found` | Node.js isn't installed | Install Node.js 18.18 or newer from https://nodejs.org/, then open a new terminal |
| `npm ci` fails with an engine or syntax error | Node.js is too old | `node -v` must be 18.18 or newer |
| `npm ci` says the lock file is out of sync | You edited `package.json` | Run `npm install` instead |
| `Cannot find module 'express'` | Dependencies aren't installed, or you're in the wrong folder | Run `npm ci` inside `GTM_Orbit/orbit` |
| `Setup is not complete yet` | Live mode is missing settings | Fix each item listed, or run `npm run offline` |
| `Port 3030 is already in use` | Another Orbit (or another app) is running | Close the other terminal, or set `ORBIT_PORT=3031` in `.env` |
| The page doesn't load | The server isn't running, or you're on a different port | Check the terminal for the `Web console:` line and open that address |
| The page loads but shows errors | The server stopped or lost its connection | Look at the terminal output. `[orbit]` lines show the failing request. |

## Snowflake

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Could not connect to Snowflake: ... account ... is invalid` or `ENOTFOUND` | Wrong `SNOWFLAKE_ACCOUNT` | Copy the identifier from Snowsight (your name → Account → Copy account identifier). Use the `ORG-ACCOUNT` form with a hyphen, without `.snowflakecomputing.com`. |
| `JWT token is invalid` | The public key in Snowflake doesn't match your private key | Redo [step 5](SETUP_SNOWFLAKE.md#step-5-create-the-apps-login-key-pair) and compare the fingerprints |
| `User ... is not found` or `Incorrect username` | `08_slack_bot.sql` wasn't run, or `SNOWFLAKE_BOT_USER` differs | Run `08_slack_bot.sql` and keep `SNOWFLAKE_BOT_USER=GTM_SLACK_BOT` |
| `private key not found` | The key file isn't at `GTM_Orbit/.keys/gtm_slack_bot.p8` | Create it ([step 5](SETUP_SNOWFLAKE.md#step-5-create-the-apps-login-key-pair)), or set `SNOWFLAKE_PRIVATE_KEY_FILE` |
| `Object 'RANKED_QUEUE_V' does not exist or not authorized` | Setup files were skipped, or the bot lacks its role | Run `01` to `09` in order. Check `SHOW GRANTS TO USER GTM_SLACK_BOT;` lists `GTM_APP_RW`. |
| `ACCOUNT_CONTACTS_V does not exist` | `09_orbit.sql` wasn't run | Run it. Until then, contact discovery falls back to permitted contacts only. |
| The queue is empty | No Salesforce records in Snowflake | Run `05_salesforce_sample.sql` (or your own sync) |
| `No active warehouse` | The warehouse is missing or not granted | Re-run `01_setup.sql` |
| In a worksheet, only one statement ran | You used **Run**, which runs the statement under the cursor | Use **Run All** (`Cmd/Ctrl + Shift + Enter`) |
| `Unknown function AI_COMPLETE` or a model error | Cortex AI isn't available on this account or region | Keep `MODEL = 'scripted'`, or see [Switching to a live model](SETUP_SNOWFLAKE.md#switching-to-a-live-model) |
| A run takes much longer than 15 seconds | The warehouse is resuming, or `SCRIPTED_DELAY_MS` is high | The first run after idle resumes the warehouse; later runs are faster |
| Freshness looks wrong | `DEMO_CONFIG.AS_OF_DATE` changed | `UPDATE GTM_DEMO.APP.DEMO_CONFIG SET AS_OF_DATE = '2026-10-23';` |

## Slack

| Symptom | Cause | Fix |
| --- | --- | --- |
| Terminal shows `Slack bot: off` | One or both tokens are empty | Fill in `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` in `.env`, then restart |
| `Slack bot: error: invalid_auth` | Wrong or revoked bot token | Copy the `xoxb-` token again from **Install App** |
| `Slack bot: error: ... not_allowed_token_type` or `invalid_auth` on connect | The app-level token is wrong or missing `connections:write` | Regenerate it under **Basic Information → App-Level Tokens** with `connections:write` |
| `/orbit failed because the app did not respond` | Orbit isn't running, or it started without Slack | Start it and check for `Slack bot: on`. Only one copy of Orbit should run per Slack app. |
| `/orbit` isn't recognized | The app isn't installed, or the manifest wasn't applied | Reinstall from **Install App**, and check **Slash Commands** lists `/orbit` |
| A command works but **Prepare brief** or other buttons do nothing | Interactivity is off, or the bot can't post in this channel | Check **Interactivity & Shortcuts** is on (the manifest enables it). Use a public channel, or `/invite @GTM Orbit` to a private one. Check the terminal for `[orbit]` errors. |
| Nothing happens in a direct message | The bot can't post into a DM between other people | Use a channel |
| `Only the account owner can act on this account` | Someone else used Orbit first and became the owner | See the **Owner rule** in [SETUP_SLACK.md](SETUP_SLACK.md#step-6-try-it) |
| Duplicate replies | Two copies of Orbit are running with the same tokens | Stop one |
| `@GTM Orbit` mentions are ignored | Event subscriptions are missing | Reapply the manifest. It subscribes to `app_mention`. |

## Salesforce

| Symptom | Cause | Fix |
| --- | --- | --- |
| `NamedOrgNotFound` | You haven't logged in with the alias | `sf org login web --alias gtm-demo` |
| Picklist errors on state or country | State and country picklists are on | The Apex seed uses `BillingStateCode` and `BillingCountryCode`, so use `sf apex run` rather than a data import |
| `FLS` or field permission errors on **Email Opt Out** | Your profile can't edit the field through import | Use the Apex seed, which runs as anonymous Apex |
| Records don't show up | The list view filter is **Recently Viewed** | Switch to **All Accounts** |
| Changes in Salesforce don't show in Orbit | The sync is a batch reload | Re-run the export, the build script and `05_salesforce_sync.sql` |

## Offline mode

| Symptom | Cause | Fix |
| --- | --- | --- |
| My runs disappeared | Offline runs are in memory | Expected after a restart |
| A brief looks identical every time | Offline mode replays a fixed snapshot | Expected. Live mode with a model varies the wording. |

## Still stuck?

Run the smoke test. It tells you whether the app itself works on your machine:

```bash
cd GTM_Orbit/orbit && npm test
```

If you open an issue, include your OS, `node -v`, the command you ran, and the terminal output with tokens and
account identifiers removed.
