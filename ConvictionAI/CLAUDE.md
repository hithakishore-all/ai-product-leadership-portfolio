# Conviction AI — rules for Claude Code

- Data model mirrors Salesforce: standard objects keep Salesforce names (account, opportunity, task...); custom objects end in __c.
- Stack: Postgres (db/schema.sql) → FastAPI (backend/app) → React UI (web/src, built to web/dist/index.html and served at /).
- The UI design is fixed: keep web/dist/index.html as one self-contained file and don't restyle screens. Only web/src/api.js talks to the server.
- All data is synthetic; keep the SYNTHETIC DEMO banner and source/status tags on every screen.
- Financial numbers come only from the deterministic engines (backend/app/engine.py, web/src/engine.js). Keep them in sync; never let an LLM compute them.
- Conflicting values are kept side by side until a reviewer records a resolution (evidence_claim__c.resolution). Never overwrite.
- Unknown values display as Missing; they never count as a pass or a default score.
- Opening cohort is $3.0M (PRD 7.2), not $4.0M (PRD 14 typo). Tests lock this in.
- Change the data model in db/schema.sql, update backend/seed.py, then run `make db`.
- One milestone at a time: `make test` passes, then commit.
- Real companies come in as company packs (packs/*.json, format in packs/README.md). Every fact needs a source URL; private metrics stay `missing`; conflicting sources become `disputed` pairs. Never invent numbers.
