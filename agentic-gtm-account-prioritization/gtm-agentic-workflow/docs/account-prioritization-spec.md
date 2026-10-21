# Account priority scoring specification

## Purpose

Separate **account priority**, **account context**, and **contact readiness** so the system can explain why an account is ranked and whether the AE has enough usable buying-group coverage to act.

## Prioritization signal inputs

These feature names are supplied for the interview architecture. Their definitions and scoring method must come from the scoring model owner; do not infer or regenerate them with an LLM.

| Signal | Current design treatment | Confirmation needed |
|---|---|---|
| EWGS score | Scoring feature from the account-priority model | Expansion of EWGS, scale, source, freshness, null behavior |
| `intent_score` | Scoring feature from the account-priority model | Source, lookback, calibration, null behavior |
| Engagement score | Scoring feature from the account-priority model | Events included, lookback, account aggregation |
| `critical_events` score | Scoring feature from the account-priority model | Event taxonomy, event weights, decay window |
| PTB / ROP score | Alternative or paired scoring feature as provided | PTB/ROP definitions, when each applies, scale |

The reviewed project materials show that an account prioritization output includes `PRIORITY_SCORE` and rationale. They do not expose the component formula or coefficients. The architecture therefore represents a versioned composite ranker with weights/calibration marked **TBD**. Keep model version, scoring timestamp, feature freshness, missing-feature behavior, and reason codes with each result. An unscored account is **unscored**, not low priority.

## Growth Vector as account context

The project analysis documents these canonical Growth Vector values:

- IAM Newco Conversion
- eSign Newco Conversion
- eSign Upgrade to IAM
- IAM Expansion
- eSign Expansion
- Potential Churn
- eSign Retention
- IAM Retention
- No Identified Growth Signal

Growth Vector is shown as optional account context alongside the rank, rationale, segment, and region. Noncanonical values should remain visible and route to data-quality review rather than silently falling through.

## Keep dimensions separate

- **Priority score:** which account deserves attention under the approved model.
- **Growth Vector:** what product motion is associated with the account. It is shown separately; its contribution to priority must be confirmed.
- **Contact readiness:** whether usable contacts cover the buying group.
- **AE decision:** whether to proceed, edit, defer, or reject in Slack.

Do not collapse these into a single generated score. They answer different questions and should remain independently visible in the Slack review card.

## Multi-agent boundary

The CrewAI agents consume the approved score/rationale and account context; they do not calculate or modify ranking. The Researcher cites approved Snowflake evidence, Composer drafts from validated context, and Validator checks evidence and policy. CrewAI Flow owns deterministic state, approvals, and error paths. The model owner remains the source for prioritization logic.

## Inputs needed to finalize the scorecard

1. EWGS and PTB/ROP definitions, including whether PTB and ROP are alternatives.
2. Signal scales, component weights, thresholds, normalization, freshness, and null handling.
3. Whether Growth Vector is a model input, a post-rank context field, or both.
4. Whether the ranked queue uses priority alone or applies readiness/territory/ownership gates after ranking.
