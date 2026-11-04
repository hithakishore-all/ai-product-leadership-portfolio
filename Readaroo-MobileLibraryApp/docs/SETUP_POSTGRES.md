# Set up Postgres

This gets Readaroo running in live mode on your computer. It takes about 10 minutes. If you only want to see the app, skip this and run `npm run offline`.

## 1. Install Postgres

| Your computer | Easiest option |
| --- | --- |
| Mac | [Postgres.app](https://postgresapp.com): download, drag to Applications, open it, click **Initialize** |
| Windows | The installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/). Remember the password you set for the `postgres` user |
| Linux | `sudo apt install postgresql` (Debian/Ubuntu) |

Any version from 14 up works.

## 2. Create the database

Open a terminal and run:

```bash
createdb readaroo
```

If that says `command not found` on a Mac with Postgres.app, add its tools to your path first:
`sudo mkdir -p /etc/paths.d && echo /Applications/Postgres.app/Contents/Versions/latest/bin | sudo tee /etc/paths.d/postgresapp`, then open a new terminal.

## 3. Fill in `.env`

In the `readaroo` folder:

```bash
cp .env.example .env
```

Open `.env` in a text editor and set:

```bash
# The owner account, used only by the setup scripts
DATABASE_ADMIN_URL=postgres://postgres@localhost:5432/readaroo
# Pick any password for the app's own account
READAROO_APP_PASSWORD=pick-a-password
# The app connects with that account
DATABASE_URL=postgres://readaroo_app:pick-a-password@localhost:5432/readaroo
```

On Mac with Postgres.app the owner is usually your Mac username, with no password: `postgres://YOUR_MAC_USERNAME@localhost:5432/readaroo`. On Windows, include the password you chose: `postgres://postgres:YOUR_PASSWORD@localhost:5432/readaroo`.

## 4. Create the tables and load the demo data

```bash
npm run db:setup
```

You should see:

```
Ran db/001_schema.sql
Ran db/002_seed.sql
Set the readaroo_app password from READAROO_APP_PASSWORD.
Done. Start the app with: npm start
```

This creates the tables, the least-privilege `readaroo_app` role, and the eight demo records.

## 5. Start the app

```bash
npm start
```

Open http://127.0.0.1:3000 and check that the Demo guide footer says `Mode: live`.

## Reset the demo data

The **Reset demo data** button only works offline. In live mode run:

```bash
npm run db:seed
```

## Change the demo data

Edit `data/generate_data.py`, then:

```bash
npm run data      # rewrites data/seed.json and db/002_seed.sql
npm run db:seed   # loads it
```

Problems? See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#postgres).
