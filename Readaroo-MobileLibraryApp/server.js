// Readaroo server: web app + JSON API.
//   npm start            live mode (Postgres, Stripe test mode if a key is set)
//   npm run offline      offline mode (in-memory synthetic data, simulated Stripe)
'use strict';
require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
const { createEngine } = require('./src/engine');
const { createMemoryStore, createFakeMeter } = require('./src/memoryStore');

function parseArgs(argv) {
  return { offline: argv.includes('--offline') || process.env.READAROO_OFFLINE === '1' };
}

async function buildDeps({ offline }) {
  if (offline) {
    const seed = require('./data/seed.json');
    return { store: createMemoryStore(seed), meter: createFakeMeter(), mode: 'offline', stripe: 'simulated' };
  }
  const problems = [];
  if (!process.env.DATABASE_URL) problems.push('DATABASE_URL is not set. Copy .env.example to .env and follow docs/SETUP_POSTGRES.md, step 3.');
  if (problems.length) {
    const err = new Error(`Live mode is not configured:\n  - ${problems.join('\n  - ')}\nOr run without accounts: npm run offline`);
    err.config = true;
    throw err;
  }
  const { createPostgresStore } = require('./src/postgresStore');
  const store = createPostgresStore(process.env.DATABASE_URL);
  try {
    await store.ping();
  } catch (e) {
    await store.close();
    const err = new Error(`Could not reach the database or its tables (${e.message}).\nCheck DATABASE_URL and run npm run db:setup (docs/SETUP_POSTGRES.md, step 4).`);
    err.config = true;
    throw err;
  }
  let meter = createFakeMeter();
  let stripe = 'simulated (no STRIPE_SECRET_KEY)';
  if (process.env.STRIPE_SECRET_KEY) {
    const { createStripeMeter } = require('./src/stripeMeter');
    meter = createStripeMeter(process.env.STRIPE_SECRET_KEY); // throws on a live key
    stripe = 'test mode';
  }
  return { store, meter, mode: 'live', stripe };
}

function createApp(deps) {
  const engine = createEngine({ store: deps.store, meter: deps.meter });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
    return next(err);
  });
  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'readaroo', mode: deps.mode, stripe: deps.stripe }));
  app.all('/api/*', async (req, res) => {
    const out = await engine.handle(req.method, req.path, req.body, req.query);
    if (out.contentType) {
      res.status(out.status).type(out.contentType);
      if (out.filename) res.attachment(out.filename);
      return res.send(out.body);
    }
    res.status(out.status).json(out.body);
  });
  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
  return app;
}

async function start({ offline, port, host } = {}) {
  const deps = await buildDeps({ offline });
  const app = createApp(deps);
  const listenPort = port ?? Number(process.env.PORT || 3000);
  const listenHost = host || process.env.READAROO_HOST || '127.0.0.1';
  return new Promise((resolve) => {
    const server = app.listen(listenPort, listenHost, () => {
      const addr = server.address();
      resolve({ server, deps, url: `http://${listenHost}:${addr.port}` });
    });
  });
}

if (require.main === module) {
  const { offline } = parseArgs(process.argv);
  start({ offline })
    .then(({ server, deps, url }) => {
      console.log(`Readaroo is running at ${url}  (mode: ${deps.mode}, Stripe: ${deps.stripe})`);
      console.log('All data is synthetic. Press Ctrl+C to stop.');
      const stop = () => {
        console.log('\nStopping Readaroo...');
        server.close(async () => {
          if (deps.store.close) await deps.store.close();
          process.exit(0);
        });
        setTimeout(() => process.exit(0), 3000).unref();
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    })
    .catch((err) => {
      console.error(err.config ? `\n${err.message}\n` : err);
      process.exit(1);
    });
}

module.exports = { start, createApp, buildDeps };
