# Claude Artifact prompt

Create a polished, interview-ready interactive prototype called **GTM Agent Studio: Account Intelligence to AE Review**.

## Product and technical story

Show the target stack clearly: **Salesforce + Gong → Snowflake → account scoring → CrewAI Flow + multi-agent Crew → Slack**. Salesforce is the system of record for all account data. Gong provides conversation inputs, including tracker results. Snowflake hosts the governed CRM and Gong data foundation and Conversational Insights. Account score features are model-owned: EWGS, intent, engagement, critical events, and PTB/ROP. Do not invent the score formula or weights; label these as inputs to the approved model. Show `PRIORITY_SCORE`, rationale, freshness, and evidence references as model outputs. Keep Growth Vector and contact readiness as separate context.

## Screens and interactions

Build a responsive technical operations dashboard with a light, friendly, professional palette: warm white background, navy/blue headings, soft teal and lavender panels, muted gray dividers, restrained amber for review states. Avoid a dark console look.

1. Architecture strip showing Salesforce + Gong into Snowflake, then scoring, CrewAI, and Slack.
2. Synthetic ranked account queue with score, rationale, evidence freshness, and contact readiness.
3. Multi-agent execution view with CrewAI Flow control plane and four visible specialists: Identifier, Researcher, Composer, Validator. Show state, handoffs, evidence references, bounded retries, and validation results.
4. Slack as the AE interface: account accepted in Slack, workflow progress, then a review card with rationale, sources, candidate contacts, and draft preview. Include Edit, Approve, Reject controls.
5. Event trace with flow ID, event names, timestamps, agent durations, and final human decision.

When the user accepts an account in Slack, simulate the CrewAI Flow invoking the agent crew and posting a review card. Buttons must only update the local prototype state.

## Boundaries

Use fictional accounts, contacts, scores, and evidence. Do not connect APIs or access real company data. No real Salesforce/Snowflake/Gong/Slack integrations, no live outreach, and no automatic sending. Label tracker examples as illustrative, not as a verified configured-tracker catalog. The current score weights and exact feature lineage are unknown; keep them explicitly marked model-owned / confirm with owner.
