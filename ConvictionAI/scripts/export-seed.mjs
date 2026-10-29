// Writes db/seed.json from web/src/data.js so the database and the offline demo
// always share one source of truth.  Run: node scripts/export-seed.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as D from "../web/src/data.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seed = {
  segments: D.SEGMENTS, rounds: D.ROUNDS, investors: D.INVESTORS, marketMap: D.PO_COMPANIES,
  helio: D.HELIO, cohort: D.COHORT_ROWS, documents: D.DOCS, claims: D.BASE_CLAIMS, deals: D.DEALS,
};
writeFileSync(join(root, "db", "seed.json"), JSON.stringify(seed, null, 2));
console.log("wrote db/seed.json");
