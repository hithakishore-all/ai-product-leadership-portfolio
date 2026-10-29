# Contributing

Thanks for taking a look. Issues and pull requests are welcome.

## Development setup

```bash
cd GTM_Orbit/orbit
npm ci
npm run offline      # http://localhost:3030, no accounts needed
npm test             # end-to-end smoke test, about 10 seconds
```

The web console in `orbit/public/` is plain HTML, CSS and JavaScript with no build step. Edit a file and reload
the page. Server changes need a restart.

## Guidelines

- Keep `npm test` passing, and add a test case for any new API behavior.
- Keep the store interface identical in `lib/snowflake-store.js` and `lib/mock-store.js`. Offline mode must behave
  like live mode.
- All Snowflake SQL from the app must use bind variables.
- New SQL goes in a new numbered file in `snowflake/`, using fully qualified names.
- Keep data fictional, and use `.example` domains for any email or website.
- Never commit `.env`, `.keys/`, `salesforce/export/` or `snowflake/05_salesforce_sync.sql`.

## Regenerating data

See [docs/SETUP_SALESFORCE.md](docs/SETUP_SALESFORCE.md#changing-the-demo-data).
