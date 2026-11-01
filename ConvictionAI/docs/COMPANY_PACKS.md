# Adding a real company

[← Back to README](../README.md)

The demo story (HelioOps) is fictional so it can show a clean contradiction. To show the product on a **real** company, research it and import it as a **company pack**: one JSON file in `packs/`. The format and validation rules are in [packs/README.md](../packs/README.md); this guide is the process.

## What a VC needs vs what is public

| Needed for the decision | Usually public? | In the pack |
| --- | --- | --- |
| Name, description, website, HQ, founded, headcount | Yes | `account` |
| Founders and their background | Mostly | `contacts` (professional facts only) |
| Latest round: amount, date, lead, participants | Yes, from the announcement | `funding_rounds` |
| Named customers, claimed outcomes | Sometimes, from the company | `claims` with status `company` |
| ARR, NRR, GRR, gross margin, burn, runway, concentration | **Almost never** | `claims` with status `missing` and a note on what to request |
| Customer-level ARR (to recompute NRR) | **Never** | `customer_arr: []` |

That gap is the point of the demo: a researched company shows low evidence coverage and the recommendation **More diligence**, with a data-room request listing exactly what's missing.

## The fast way: let the agent do it

With `ANTHROPIC_API_KEY` in `.env`, click **✦ Research a company** in Company 360. A Claude agent with web search follows the process below, submits the pack, and the server checks it with the same validator plus one more rule: every source URL must be a page the agent's searches actually returned. If anything fails, the problems go back to the agent to fix (up to three times). The result is imported and saved to `packs/<slug>.json`, marked *not yet reviewed*. Open the sources and check them before you rely on it.

The agent's instructions are in [`backend/app/research.py`](../backend/app/research.py) (`system_prompt`).

## The process (by hand, or what the agent does)

1. **Find the anchor.** Search for the latest funding announcement. Pick a recent, small round (Seed to Series B) so there's news coverage but no deep public financials.
2. **Open every page you cite.** Add each to `sources` with publisher, title, URL, published date and retrieved date. Only pages actually read go in.
3. **Fill the account and contacts** from those pages. Leave a field out rather than guess.
4. **Add the round and its investors.** Investors become `Investor` accounts automatically; existing ones are reused by name.
5. **Write the claims.** The same ten are marked `critical` for every company so coverage is comparable: ARR, NRR, GRR, gross margin, cash and monthly burn, largest-customer share of ARR, latest round amount (local currency), latest round amount (USD), named customers, customer outcomes. Mark any not public as `missing`.
6. **Record conflicts.** If two sources disagree (a USD conversion, the company website), add one claim per value, both `disputed`, each with its source.
7. **Validate and import:**

   ```bash
   make import PACK=packs/<company>.json
   ```

   The importer lists every problem if the pack breaks a rule. Fix them and run it again; re-importing replaces the company.
8. **Look at it.** `make run` → Company 360 → choose the company in the picker.

## Example: ClearOps

[`packs/clearops.json`](../packs/clearops.json), researched on 2026-10-28:

- Munich, founded 2020, about 60 employees, AI operating system for industrial after-sales.
- €8.6M Series A in May 2026, led by Hitachi Ventures with Schoeller Group and Barkawi Group.
- 19 claims from 5 sources: **6 missing** (the private financials), **3 disputed** (the USD value of the round, and two different website domains).
- Coverage 3/10 → **More diligence**.

## Using Claude to research a pack

The repo's [CLAUDE.md](../CLAUDE.md) holds the pack rules, so an AI assistant working in this folder will follow them. A prompt that works:

> Research <company> from public sources and write packs/<slug>.json following packs/README.md. Only cite pages you opened. Mark private metrics missing. Record conflicting sources as disputed pairs. Then run make import PACK=packs/<slug>.json and fix any validation errors.

Check every source link yourself before showing the result to anyone.

[← Back to README](../README.md)
