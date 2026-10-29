# Setting up PostgreSQL

[← Back to README](../README.md)

The live app needs a PostgreSQL server on your machine. The offline demo (`web/dist/index.html`) doesn't, so skip this guide if that's all you want.

## 1. Install PostgreSQL (pick one)

| | Official installer (EDB) | Postgres.app |
| --- | --- | --- |
| Get it | [postgresql.org/download/macosx](https://www.postgresql.org/download/macosx/) | [postgresapp.com](https://postgresapp.com) |
| Runs as | A background service that starts with your Mac | An app you open; elephant icon in the menu bar |
| User / password | `postgres` / the password you choose during install | Your Mac username / no password |
| Installed to | `/Library/PostgreSQL/<version>` | `/Applications/Postgres.app` |

**Official installer.** Run it, accept the defaults (port 5432), and **write down the password you choose**. You can untick Stack Builder at the end.

**Postgres.app.** Drag it to Applications, open it, click **Initialize**.

Any version from 14 up works; the project is tested on 16 and 18.

## 2. Point the app at it

From the `ConvictionAI` folder, run `make setup` once; it creates `.env` from `.env.example`. Open `.env` in any text editor and keep **one** `DATABASE_URL` line:

```bash
# Official installer: replace CHANGE_ME with your password
DATABASE_URL=host=localhost port=5432 dbname=conviction_ai user=postgres password=CHANGE_ME

# Postgres.app: no password
DATABASE_URL=postgresql://localhost:5432/conviction_ai
```

If your password contains spaces or quotes, wrap it in single quotes: `password='my pass'`.

Then:

```bash
make doctor   # should end with "All N checks passed"
make db       # creates the conviction_ai database and loads everything
```

You don't create the database yourself; `make db` does it, and re-running it resets everything to the demo state.

## 3. Explore the tables (optional)

`psql` comes with both installs. If `make doctor` says it isn't on your PATH, it prints the one-line fix. Then:

```bash
psql -h localhost -U postgres -d conviction_ai     # Postgres.app: psql conviction_ai
```

```sql
\dt                                               -- list the 13 tables
SELECT name, record_type FROM account ORDER BY record_type, name;
SELECT id, stage_name, flag FROM opportunity ORDER BY id;
SELECT name, value_text, status FROM evidence_claim__c
  WHERE account_id = (SELECT id FROM account WHERE slug = 'helioops') AND is_critical;
SELECT customer, opening_arr_k, ending_arr_k FROM customer_arr__c ORDER BY row_number;
SELECT * FROM opportunity_field_history ORDER BY created_date DESC LIMIT 5;
\q
```

Prefer a GUI? pgAdmin comes with the official installer. Connect to `localhost:5432` with the same user and password, database `conviction_ai`.

## Starting and stopping

| Install | Start | Stop |
| --- | --- | --- |
| Official installer | Starts automatically at login. To restart: `sudo launchctl kickstart -k system/postgresql-<version>` | `sudo launchctl stop system/postgresql-<version>` (or leave it running) |
| Postgres.app | Open the app | Menu bar elephant → Stop |

## Linux and Windows

- **Linux (Debian/Ubuntu):** `sudo apt install postgresql`, then `sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'yourpassword';"` and use the key=value line in `.env`.
- **Windows:** use WSL (Ubuntu) and follow the Linux steps; `make` and the scripts expect a Unix shell.

[← Back to README](../README.md)
