# Changelog

## 1.2.0 (2026-11-01)

- **Value creation for sponsors:** new **Add-on Screener** (buy-and-build ranking with adjustable weights, sourced facts and scored reasoning) and **Exit Readiness** (buyer-diligence checklist, readiness score, holding period vs a comparable exit, sale-prep plan). Both run live and offline.
- **ParentSquare** pack: a real Serent Capital company with 32 claims from 18 public sources and six researched add-on candidates.
- Packs can describe companies outside the six tracked segments and rounds with undisclosed amounts.
- New object `addon_target__c`; endpoints `POST /api/accounts/{slug}/addons` and `GET /api/accounts/{slug}/exit-readiness`.
- 46 automated tests (34 server, 12 browser).

## 1.1.0 (2026-10-31)

- **Live research:** **✦ Research a company** in Company 360 starts a Claude research agent with web search. It builds a company pack, the validator checks it (every source must be a page the agent actually found; private metrics stay missing), and it's imported into Postgres and saved to `packs/`.
- New endpoints: `GET /api/research/status`, `POST /api/research`, `GET /api/research/{job_id}`.
- Optional settings `ANTHROPIC_API_KEY` and `RESEARCH_MODEL`. Without a key everything else works as before.
- 6 new tests using a scripted fake of the API (38 in total).

## 1.0.0 (2026-10-29)

First public release.

- **Discover:** Opportunity Radar ranks six AI sub-segments on an inflection index, with mega-rounds included or excluded; Capital Flows; Market Map.
- **Qualify:** Fund Thesis as editable rules; Deal Pipeline with stage changes audited in `opportunity_field_history`; Company 360 with an evidence board.
- **Decide:** Underwriting (TAM/SAM/SOM, VC exit scenarios), rule-based recommendation, bear case, IC memo draft.
- **PE mode:** Crestline Field Systems with LBO-lite and EBITDA-adjustment acceptance.
- **Signature story:** HelioOps NRR recomputed at 113.0% from 16 customer rows against a 124% claim; both values kept until a reviewer resolves them.
- **Full stack:** PostgreSQL with a Salesforce-shaped schema (13 objects), FastAPI service, React UI built into one self-contained HTML file that also runs offline.
- **Company packs:** import real companies researched from public sources; ClearOps (Munich, €8.6M Series A) included.
- **Tooling:** `make doctor` environment checks, one-command setup, 32 automated tests plus an end-to-end browser test.
