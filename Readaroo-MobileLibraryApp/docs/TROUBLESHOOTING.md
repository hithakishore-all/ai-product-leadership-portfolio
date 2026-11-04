# Troubleshooting

## Node and npm

| Symptom | Cause | Fix |
| --- | --- | --- |
| `node: command not found` | Node isn't installed | Install the LTS from [nodejs.org](https://nodejs.org), then open a new terminal |
| `npm ci` says the lockfile is missing or out of sync | Files were copied without `package-lock.json` | Make sure `package-lock.json` is in the folder, or run `npm install` |
| `EADDRINUSE: address already in use 127.0.0.1:3000` | Something else uses port 3000 | `PORT=3001 npm run offline` (Windows PowerShell: `$env:PORT=3001; npm run offline`) |
| Page says "Cannot reach the Readaroo server" | The server stopped | Run `npm run offline` or `npm start` again |
| Fonts look plain | No internet, so Google Fonts didn't load | Nothing to fix; system fonts are used |
| The reader counts a minute every second | Demo speed (`readingSecondsPerMinute` = 1) | Set it to 60 in `data/generate_data.py`, then `npm run data` and `npm run db:seed` |
| No "Add to calendar" button | You're in the single-file demo, which can't hand out files | Run the app (`npm run offline`) to download invites |

## Postgres

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Live mode is not configured: DATABASE_URL is not set` | No `.env` | `cp .env.example .env` and follow [SETUP_POSTGRES.md](SETUP_POSTGRES.md#3-fill-in-env) |
| `Could not reach the database or its tables (connect ECONNREFUSED)` | Postgres isn't running | Start Postgres.app or the Postgres service |
| `... relation "app_config" does not exist` | Tables not created | `npm run db:setup` |
| `password authentication failed for user "readaroo_app"` | `READAROO_APP_PASSWORD` and `DATABASE_URL` disagree | Make them match, then `npm run db:setup` |
| `database "readaroo" does not exist` | Step 2 skipped | `createdb readaroo` |
| `permission denied for table events` | Expected: the app role can't edit the audit log | Use `DATABASE_ADMIN_URL` for maintenance |
| `relation "sessions" does not exist` after updating to 0.2 | The database still has the 0.1 tables | `npm run db:setup` (this recreates the tables and reloads demo data) |
| Reset button says "only available in offline mode" | Live data isn't reset from the browser | `npm run db:seed` |

## Stripe

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Refusing to start: STRIPE_SECRET_KEY is a live key` | You pasted `sk_live_…` | Turn on **Test mode** in the dashboard and copy the `sk_test_…` key |
| `STRIPE_SECRET_KEY should start with sk_test_` | A publishable key (`pk_…`) or a typo | Copy the **secret** key |
| Toast: "Could not record the charge with Stripe" | Network error, bad key, or no meter | Check the key, run `npm run stripe:setup`; nothing was charged |
| `This library has no Stripe customer yet` | `stripe:setup` not run, or the database was reseeded | `npm run stripe:setup` (run it again after every `db:seed`) |
| Meter event not visible yet | Stripe processes meter events asynchronously | Wait a minute and refresh **Billing → Meters** |
| Footer says `Stripe: simulated (no STRIPE_SECRET_KEY)` | No key in `.env` | Expected without a key |

## Tests

| Symptom | Cause | Fix |
| --- | --- | --- |
| `skipped 1` | The live Postgres test needs `TEST_DATABASE_URL` | Expected; see [README](../README.md#testing) |
| Live test fails on seed | `TEST_DATABASE_ADMIN_URL` can't truncate tables | Point it at the owner account of a throwaway database |
