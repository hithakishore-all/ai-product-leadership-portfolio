# Snowflake setup

This creates everything GTM Orbit needs in your Snowflake account:

- the `GTM_DEMO` database with its demo data
- the governed views
- the agent flow
- a key-pair service user the app logs in as

It takes about 15 minutes. A [free trial account](https://signup.snowflake.com/) works.

[← Back to README](../README.md)

## What you'll create

| File | Creates |
| --- | --- |
| `01_setup.sql` | Warehouse `GTM_DEMO_WH` (X-Small, auto-suspends after 60 s), database `GTM_DEMO`, six schemas, roles `GTM_AGENT_RO` and `GTM_APP_RW` |
| `02_tables.sql` | Tables for Salesforce, Gong, signals, scoring, config, flow state and audit |
| `03_views.sql` | `CONTACT_READINESS_V`, `EVIDENCE_V`, `ACCOUNT_CONTEXT_V` (the governed view), `RANKED_QUEUE_V` |
| `04_seed_data.sql` | Demo accounts, sequences, simulated Gong calls, product usage, intent, events, scores |
| `05_salesforce_sample.sql` **or** `05_salesforce_sync.sql` | Salesforce accounts, contacts, opportunities and cases, plus the account owner |
| `06_agents.sql` | Agent config, seller notes, the flow procedure, `AE_ACTION`, `RECOMMENDATION_ACTION`, `FLOW_TRACE_V` |
| `07_scripted_agents.sql` | Scripted agent wording (no AI needed) and the final `RUN_ACTIVATION_FLOW` |
| `08_slack_bot.sql` | Service user `GTM_SLACK_BOT` (key pair only) and `RESET_DEMO()` |
| `09_orbit.sql` | `ACCOUNT_CONTACTS_V` (contact discovery) and `SET_OWNER_SLACK_ID` |

All files use fully qualified names and start with `USE ROLE ACCOUNTADMIN`, so you can run them from any worksheet.
Lines that contain only `-- @@` are harmless comments that mark statement boundaries.

## How to run a SQL file

Use either of these methods for every file below.

**In Snowsight (browser).** Open Snowsight and go to **Projects → Workspaces** (or **Worksheets** on older
accounts). Create a new SQL file, paste in the whole file, and click **Run All** in the run button's menu.
The keyboard shortcut is `Cmd + Shift + Enter` on Mac or `Ctrl + Shift + Enter` on Windows. Plain **Run**
executes only the statement under the cursor.

**With the Snowflake CLI.** Install the [Snowflake CLI](https://docs.snowflake.com/en/developer-guide/snowflake-cli/installation/installation)
and add a connection (`snow connection add`). Then from `GTM_Orbit/`:

```bash
for f in 01_setup 02_tables 03_views 04_seed_data 05_salesforce_sample 06_agents 07_scripted_agents; do
  snow sql -f snowflake/$f.sql -c <your-connection> || break
done
```

## Step 1: Sign in as ACCOUNTADMIN

Sign in to Snowsight. The scripts switch to `ACCOUNTADMIN` themselves. Your user needs that role, which trial
users have by default.

## Step 2: Create the database and load the demo data

Run these files in order: `01_setup.sql`, `02_tables.sql`, `03_views.sql`, then `04_seed_data.sql`.

`01_setup.sql` grants both demo roles to you, so you can query the views as yourself.

## Step 3: Load the Salesforce records

Pick one of these files:

- **No Salesforce org.** Run `snowflake/05_salesforce_sample.sql`. It loads the same 10 accounts, 29 contacts,
  13 opportunities and 7 cases, using stand-in record IDs and the fictional owner *Alex Rivera*.
- **Your own Salesforce org.** First follow [SETUP_SALESFORCE.md](SETUP_SALESFORCE.md). That guide generates
  `snowflake/05_salesforce_sync.sql` from your org; run it instead.

Re-running either file replaces the Salesforce tables, so you can switch between them later.

## Step 4: Install the agent flow

Run `06_agents.sql`, then `07_scripted_agents.sql`.

Check that everything is in place:

```sql
SELECT QUEUE_RANK, ACCOUNT_NAME, PRIORITY_SCORE, SCORE_FRESHNESS FROM GTM_DEMO.APP.RANKED_QUEUE_V ORDER BY 1;
-- 10 rows, Northstar Field Services first, Quarry & Pine "unscored" last

CALL GTM_DEMO.APP.RUN_ACTIVATION_FLOW('GTM-0001', 'setup-check');
-- returns a JSON brief after about 10 seconds; look for "status" and "validator"

SELECT EVENT, ACTOR, DURATION_MS FROM GTM_DEMO.APP.FLOW_TRACE_V ORDER BY TS;
-- context.loaded, crew.identifier.done, ..., crew.validator.failed, ..., crew.validator.passed
```

## Step 5: Create the app's login (key pair)

The app logs in as a service user with a key pair, so no password is stored anywhere. In a terminal, from
`GTM_Orbit/`:

```bash
mkdir -p .keys
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out .keys/gtm_slack_bot.p8
openssl rsa -in .keys/gtm_slack_bot.p8 -pubout -out .keys/gtm_slack_bot.pub
grep -v -- '-----' .keys/gtm_slack_bot.pub | tr -d '\n'; echo     # prints the public key on one line
```

On Windows, run these commands in Git Bash.

1. Copy the one-line public key the last command prints.
2. Open `snowflake/08_slack_bot.sql`. Replace the placeholder in `ALTER USER GTM_SLACK_BOT SET RSA_PUBLIC_KEY = '...'`
   with the key, then run the file.
3. Run `09_orbit.sql`.

Keep `.keys/gtm_slack_bot.p8` private. It is git-ignored. Only the public key goes into Snowflake.

Optional check that the keys match: the two fingerprints below should be identical.

```sql
DESC USER GTM_SLACK_BOT;   -- look at RSA_PUBLIC_KEY_FP
```

```bash
openssl rsa -pubin -in .keys/gtm_slack_bot.pub -outform DER 2>/dev/null | openssl dgst -sha256 -binary | openssl enc -base64
# Snowflake shows the same value prefixed with SHA256:
```

## Step 6: Point the app at your account

1. In Snowsight, click your name (bottom left), then **Account**, then **Copy account identifier**. It looks like
   `ABCDEFG-XY12345`.
2. From `GTM_Orbit/`, run `cp .env.example .env`. Open `.env` and set `SNOWFLAKE_ACCOUNT=ABCDEFG-XY12345`.

Use a hyphen between the two parts of the identifier, not a dot.

## Step 7: Run and verify

```bash
cd orbit
npm ci
npm start
```

The header in http://localhost:3030 should say **Snowflake live**. Run a brief for Northstar, then confirm the
same run in Snowflake:

```sql
SELECT * FROM GTM_DEMO.APP.FLOW_TRACE_V ORDER BY TS DESC LIMIT 30;
```

## Switching to a live model

By default `AGENT_CONFIG.MODEL = 'scripted'`, because trial accounts block AI functions until you add a payment
method. To generate the agents' wording with a model through Snowflake Cortex:

1. Make sure your account can call `AI_COMPLETE`: a paid account, or a trial with a payment method added. Model
   availability depends on your region. If your region lacks the model, an admin can allow cross-region calls:
   `ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION';`
2. Check that a model works:
   ```sql
   SELECT AI_COMPLETE('claude-sonnet-4-5', 'Say hello in five words.');
   ```
3. Point the flow at the model. The installed procedure handles both modes, so nothing needs to be reinstalled:
   ```sql
   UPDATE GTM_DEMO.APP.AGENT_CONFIG SET VALUE = 'claude-sonnet-4-5' WHERE KEY = 'MODEL';
   ```
4. To go back to scripted wording:
   ```sql
   UPDATE GTM_DEMO.APP.AGENT_CONFIG SET VALUE = 'scripted' WHERE KEY = 'MODEL';
   ```

Live models produce different wording on every run. Validate still applies the same evidence checks.

## Day-to-day

| Task | How |
| --- | --- |
| Clear runs before a recording | **Reset demo runs** in the console, `/orbit reset` in Slack, or `CALL GTM_DEMO.APP.RESET_DEMO();` |
| Change the demo's "today" | `UPDATE GTM_DEMO.APP.DEMO_CONFIG SET AS_OF_DATE = '2026-10-23';` |
| Slow down or speed up agent steps | `UPDATE GTM_DEMO.APP.AGENT_CONFIG SET VALUE = '800' WHERE KEY = 'SCRIPTED_DELAY_MS';` |
| See every run | `SELECT * FROM GTM_DEMO.APP.FLOW_RUNS ORDER BY CREATED_AT DESC;` |
| Cost | The X-Small warehouse suspends after 60 seconds idle. A demo session uses a few credits at most. |

## Uninstall

```sql
USE ROLE ACCOUNTADMIN;
DROP DATABASE IF EXISTS GTM_DEMO;
DROP USER IF EXISTS GTM_SLACK_BOT;
DROP ROLE IF EXISTS GTM_APP_RW;
DROP ROLE IF EXISTS GTM_AGENT_RO;
DROP WAREHOUSE IF EXISTS GTM_DEMO_WH;
```

Then delete `GTM_Orbit/.keys/`.

Having trouble? See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#snowflake).
