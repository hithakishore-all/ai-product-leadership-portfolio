# Troubleshooting

[← Back to README](../README.md)

Start with `make doctor`. It checks every prerequisite and prints the fix under anything marked ✗. Fix from the top down; later checks often depend on earlier ones.

## Installing

| Symptom | Cause | Fix |
| --- | --- | --- |
| `zsh: command not found: make` or `git` | Apple command line tools not installed | `xcode-select --install` |
| `zsh: command not found: brew` | Homebrew isn't installed, and isn't needed | Use the installers linked in the README instead |
| `npm ERR! code EACCES` | An earlier `sudo npm` left root-owned files in `~/.npm` | `sudo chown -R $(id -u):$(id -g) ~/.npm`, then `make setup` |
| `No matching distribution found for psycopg-binary` | Python too old or too new for the pinned wheel | Install Python 3.12 from python.org, delete `.venv`, run `make setup` |
| `Requires-Python >=3.10` during `pip install` | An older Python picked up a newer package | Check `python3 --version` is 3.9+; delete `.venv` and rerun `make setup` |
| `.env does not exist` | `make setup` hasn't been run | `make setup` |

## Database

| Symptom | Cause | Fix |
| --- | --- | --- |
| `password authentication failed for user "postgres"` | Wrong password in `.env` | Use the password you chose when installing PostgreSQL. Forgot it? See below |
| `.env still has the placeholder password` | `CHANGE_ME` not replaced | Edit `.env` |
| `Connection refused` / nothing on port 5432 | Postgres isn't running | Open Postgres.app, or `sudo launchctl kickstart -k system/postgresql-<version>`, or restart the Mac |
| `role "postgres" does not exist` | Using Postgres.app with the installer's connection line | Use the `postgresql://localhost:5432/conviction_ai` line from `.env.example` |
| `relation ... already exists` or columns missing after an update | Old tables from an earlier version | `make db` (it drops and rebuilds the schema) |
| `psql: command not found` | Postgres installed but not on your PATH | Run the line `make doctor` prints, then reopen Terminal |

**Forgot the installer password?** Open `/Library/PostgreSQL/<version>/data/pg_hba.conf` as admin, change `scram-sha-256` to `trust` on the `127.0.0.1` lines, restart Postgres, run `psql -h localhost -U postgres -c "ALTER USER postgres PASSWORD 'newpassword';"`, then change `trust` back and restart again.

## Running

| Symptom | Cause | Fix |
| --- | --- | --- |
| White page at `localhost:8000` | UI not built | `make build`, then reload |
| Badge says **Offline** although `make run` is running | The file was opened instead of the server URL, or the database is unreachable | Open `http://localhost:8000`; read the terminal for the database error |
| `Address already in use` | A previous server is still running | `pkill -f "[u]vicorn app.main"`, then `make run` |
| Screens show old data after editing `web/src` | Browser cached the old build, or it wasn't rebuilt | `make build` and hard-reload (Cmd+Shift+R) |
| Pipeline shows moves you didn't make | Demo state from an earlier session | **Reset demo** (bottom left) |
| ClearOps isn't in the company picker | Offline mode, or packs not imported | Use live mode; run `make db` or `make import PACK=packs/clearops.json` |
| **Research a company** says live research is off | No API key | Add `ANTHROPIC_API_KEY=sk-ant-…` to `.env`, then stop (Ctrl+C) and restart `make run` |
| Research stops with `authentication_error` | The key is wrong or revoked | Create a new key at console.anthropic.com and update `.env` |
| Research stops with a 400 about web search | Web search is turned off for your Anthropic organization | An admin can turn it on in the Claude Console |
| Research stops: "could not produce a valid pack" | The agent kept citing pages it didn't find, or guessing private numbers | Try again with a hint (city, sector, round); obscure companies may not have enough public sources |
| Research found the wrong company | The name is common | Add a hint, or delete `packs/<slug>.json` and run `make db` |
| `Import failed: Pack is not valid` | The pack breaks a rule | The message lists each problem; see [packs/README.md](../packs/README.md) |

## Tests

| Symptom | Cause | Fix |
| --- | --- | --- |
| API tests **skipped** | Postgres not reachable | Start Postgres; check `make doctor` |
| `e2e_live.py` can't find Chromium | Playwright browsers not installed | `python -m playwright install chromium` |

[← Back to README](../README.md)
