# Product brief: GTM Agent Studio

## Problem
Account executives spend time assembling account context, identifying the right buying-group contacts, selecting an outreach sequence, and drafting initial messages. The concept is to coordinate those preparation tasks while preserving seller control over customer-facing actions.

## User
Account executives reviewing recommended accounts; revenue operations teams configuring signals and workflow policy.

## Outcome
After accepting an account, the AE receives a traceable outreach package: suggested sequence, contact candidates, evidence-backed account context, and editable draft messages.

## Core journey
All Salesforce accounts flow into Snowflake. A prioritized account appears in Slack; the AE accepts it there. CrewAI Flow loads account context and controls state while a Crew runs identifier, research, composer, and validator agents. A review card returns to Slack for AE edit/approve/reject.

## MVP boundary
The portfolio demo simulates Salesforce + Gong → Snowflake → account scoring → CrewAI → Slack handoffs using fictional data. Salesforce is the source of record for all accounts; Snowflake is the analytics layer; Slack is the AE control surface. The demo does not connect to these services, contact vendors, email, or live language models. Production execution, contact acquisition, and message sending are out of scope.

## Success measures to validate
- Time from account acceptance to review-ready package.
- Percentage of drafts accepted with minor edits.
- Contact-role accuracy and evidence coverage.
- Unsupported-claim and policy-violation rate.
- Seller trust and override rate.

## Product principles
- Show evidence and uncertainty alongside recommendations.
- Missing data is unknown, not a negative signal.
- Keep account priority separate from contact readiness.
- Keep the human in control of external actions.
- Respect opt-outs, ownership, and approved data sources.
