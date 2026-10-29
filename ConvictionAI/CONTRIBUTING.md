# Contributing

Thanks for taking a look. Conviction AI is a portfolio demo, but issues and pull requests are welcome.

## Development setup

```bash
make doctor   # check prerequisites
make setup    # venv, packages, UI build, .env
make db       # database with demo data
make run      # http://localhost:8000, auto-reloads the API
```

The UI source is in `web/src`. After editing it, run `make build` (or `make run`, which builds first) and reload.

## Guidelines

- **Keep the UI one self-contained file.** `web/dist/index.html` is both the live UI and the offline demo. Don't add external scripts, fonts or a second page. Commit the rebuilt file with your change.
- **Only `web/src/api.js` talks to the server.** Screens receive data in the shapes they already use.
- **No language model in the calculation path.** Financial numbers come from `backend/app/engine.py` and `web/src/engine.js`. Change both together and add a test to each.
- **Never overwrite conflicting evidence.** Disputed values stay side by side until a reviewer resolves them.
- **Unknown stays unknown.** Missing values never count as a pass or receive a default score.
- **Schema changes** go in `db/schema.sql`, then `backend/seed.py`, then `make db`. Keep Salesforce names for standard objects and the `__c` suffix for custom ones.
- **Company packs** must cite a source for every fact and must not invent private numbers. See [packs/README.md](packs/README.md).
- **Demo data stays fictional**, and the SYNTHETIC DEMO banner stays on every screen.
- `make test` passes before you open a pull request.

[CLAUDE.md](CLAUDE.md) holds the same rules for AI coding assistants.

## Continuous integration

GitHub only runs workflows from the repository root, so this folder has none of its own. To add CI, put a workflow in the root `.github/workflows/` with `working-directory: ConvictionAI`, a `postgres:16` service, and steps for `pip install -r backend/requirements.txt`, `npm ci && npm run build` in `web/`, `python backend/seed.py`, then `pytest -q` and `npm test`.
