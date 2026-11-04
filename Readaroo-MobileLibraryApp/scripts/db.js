// Database helper.
//   npm run db:setup   create tables + the readaroo_app role, then load the demo data
//   npm run db:seed    reload the demo data only (wipes Readaroo tables)
// Uses DATABASE_ADMIN_URL (an owner account) if set, otherwise DATABASE_URL.
'use strict';
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const cmd = process.argv[2];
  if (!['setup', 'seed'].includes(cmd)) {
    console.error('Usage: node scripts/db.js setup|seed');
    process.exit(1);
  }
  const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('Set DATABASE_ADMIN_URL (or DATABASE_URL) in .env first. See docs/SETUP_POSTGRES.md, step 3.');
    process.exit(1);
  }
  const files = cmd === 'setup' ? ['001_schema.sql', '002_seed.sql'] : ['002_seed.sql'];
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const f of files) {
      await client.query(fs.readFileSync(path.join(__dirname, '..', 'db', f), 'utf8'));
      console.log(`Ran db/${f}`);
    }
    if (process.env.READAROO_APP_PASSWORD && cmd === 'setup') {
      await client.query(`ALTER ROLE readaroo_app PASSWORD ${client.escapeLiteral(process.env.READAROO_APP_PASSWORD)}`);
      console.log('Set the readaroo_app password from READAROO_APP_PASSWORD.');
    }
    console.log('Done. Start the app with: npm start');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(`Database step failed: ${e.message}`);
  console.error('Check the connection string and that the account can create tables. See docs/TROUBLESHOOTING.md.');
  process.exit(1);
});
