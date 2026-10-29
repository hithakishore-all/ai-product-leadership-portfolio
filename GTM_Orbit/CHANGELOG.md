# Changelog

## 1.0.0 (2026-10-29)

First public release.

- Web console: ranked queue with freshness, signals, buying group, score inputs, brief with cited claims,
  edit/approve/reject, audit trail, demo reset.
- Slack bot: `/orbit` queue, account, contacts, brief, reset and help; mentions; approve, edit and reject in
  Slack; audit trail in thread.
- Snowflake: `GTM_DEMO` database, governed `ACCOUNT_CONTEXT_V`, Discover → Research → Compose → Validate flow
  with up to 2 validator retries, owner check, idempotent actions, full audit trail.
- Offline mode that replays the deployed flow, with no accounts needed.
- Sample Salesforce records for Snowflake, so a Salesforce org is optional.
- Configuration checks with clear messages, `/api/health`, clean shutdown, end-to-end smoke test.
