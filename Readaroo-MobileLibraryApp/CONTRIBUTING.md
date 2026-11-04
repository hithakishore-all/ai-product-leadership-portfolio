# Contributing

Thanks for looking. Readaroo is a small prototype, so keep changes focused.

1. `npm ci`
2. Make your change. Product rules belong in `src/engine.js`; keep both stores (`memoryStore.js`, `postgresStore.js`) in step.
3. If you change demo data, edit `data/generate_data.py` and run `npm run data`. Never hand-edit `data/seed.json` or `db/002_seed.sql`.
4. If you change the app or engine, run `npm run build:demo` so `demo/readaroo-demo.html` stays in sync.
5. `npm test` must pass. Add a test for any new rule.
6. Keep all data fictional and use `.example` domains for any email or site.
