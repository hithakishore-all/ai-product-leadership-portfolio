# Company packs

A company pack is one JSON file with everything Conviction AI needs to show a real company: its profile, founders, funding, and every fact as an evidence claim with a source, a date and a status. Packs are produced by web research (the `company-intel-pack` skill) and imported with:

```bash
make import PACK=packs/clearops.json   # add or refresh one company
make db                                # rebuild everything; imports every pack in this folder
```

or in the app: **Company 360 → Import pack** (live mode).

## What the demo needs, and where it comes from

| Pack section | Becomes (object) | Typical public source | If not public |
| --- | --- | --- | --- |
| `account` | `account` (+ `account_segment__c`) | Funding press release, company site, startup databases | Leave the field out |
| `contacts` | `contact` | Press release, company team page | Leave empty; never guess |
| `funding_rounds` | `funding_round__c` + investor `account`s + `round_participant__c` | Funding announcements, startup databases | — |
| `claims` | `evidence_claim__c` | Every page above | Add the claim with `status: "missing"` |
| `customer_arr` | `customer_arr__c` (NRR/GRR are recomputed from it) | **Never public.** Only from a company data room | Leave `[]`; NRR shows as Missing |
| `opportunity` | `opportunity` + `opportunity_field_history` | Your fund's decision to track it | Leave out |
| `sources` | Source links on every claim | The pages actually opened | — |

The critical metrics a VC needs (ARR, NRR, GRR, gross margin, burn, customer concentration) are almost never public. A good pack lists them as `missing` claims with a note on what to request. That is what drives evidence coverage down and the recommendation to **More diligence**: the honest answer.

## Rules (the importer enforces the first four)

1. Every claim that isn't `missing` or `assumption` points to a `source` id.
2. A `missing` claim has no value.
3. Status is one of: `verified`, `calculated`, `company` (the company says so), `third` (reported by press or a database), `inferred`, `assumption`, `missing`, `disputed`.
4. Exactly one primary segment, and it must exist (`po`, `me`, `as`, `ha`, `ir`, `dc`).
5. When sources disagree, add one claim per value, both `disputed`, with a note naming each source.
6. Company-reported results (e.g. "up to 40% better parts availability") stay `company`, never `verified`.
7. Inferences about people are limited to professional facts and are phrased as questions to verify.
8. Never invent private numbers. A pack with honest gaps beats a full one.

## Format

```jsonc
{
  "pack_version": "1.0",
  "generated_at": "2026-10-28",
  "generated_by": "who or what produced it",
  "is_synthetic": false,
  "sources": [{ "id": "s1", "publisher": "Munich Startup", "title": "…", "url": "https://…", "published": "2026-05-27", "retrieved": "2026-10-28", "kind": "press|company|database" }],
  "account": { "name": "ClearOps", "slug": "clearops", "record_type": "Startup", "description": "…", "website": "…",
               "billing_city": "Munich", "billing_country": "Germany", "founded_year": 2020, "number_of_employees": 60,
               "company_stage": "Series A", "sub_segment": "…", "segments": [{ "segment_id": "po", "is_primary": true }] },
  "contacts": [{ "name": "…", "title": "Founder & CEO", "domain_evidence": "…", "evidence_status": "third", "source": "s1" }],
  "funding_rounds": [{ "id": "clearops-series-a", "stage": "Series A", "quarter": "2026 Q2", "amount_local": "€8.6M", "amount_usd_m": 9.4,
                       "investors": [{ "name": "Hitachi Ventures", "role": "lead" }], "source": "s1" }],
  "claims": [{ "id": "co-arr", "name": "ARR", "value": null, "status": "missing", "critical": true, "note": "Not public." },
             { "id": "co-raise", "name": "Series A amount", "value": "€8.6M", "status": "third", "critical": true, "source": "s1" }],
  "customer_arr": [],
  "opportunity": { "id": "clearops", "fund_id": "f2", "stage_name": "Identified", "round_label": "Track for Series B", "owner_name": "…", "flag": "…" }
}
```

Mark the same ten claims `critical` in every pack (the six financial metrics, the latest round amount in local and USD terms, named customers, customer outcomes) so coverage is comparable across companies.

`clearops.json` is a complete, real example researched on 2026-10-28.
