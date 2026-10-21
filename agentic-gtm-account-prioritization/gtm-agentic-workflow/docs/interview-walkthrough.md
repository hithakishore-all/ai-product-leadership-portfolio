# Interview walkthrough (about 4 minutes)

## 1. The problem (30 seconds)

AEs get many recommended accounts, but priority alone does not tell them why an account matters, what evidence supports the recommendation, or whether usable contacts are available. Preparing an outreach package takes research and coordination across systems.

## 2. The data foundation (45 seconds)

Salesforce remains the account source of record, with all accounts flowing into Snowflake. Gong is another input: call facts and tracker results can be joined to accounts and opportunities through the governed Snowflake foundation. Conversational Insights adds structured themes and evidence. The goal is one explainable account context, not another isolated transcript pipeline.

## 3. Prioritization (45 seconds)

The approved scoring model owns EWGS, intent, engagement, critical-events, and PTB/ROP inputs and produces the priority score and rationale. I keep the formula outside the LLM workflow. Growth Vector and contact readiness remain visible as distinct context, and unknown or unscored values stay unknown.

## 4. Multi-agent workflow (90 seconds)

Slack is the AE surface. The AE accepts an account there. A CrewAI Flow manages state and control: validates the event, coordinates the sequence, routes errors, and enforces the approval gate. It invokes a Crew with four bounded agents: Identifier proposes permitted sequence/contact candidates; Researcher prepares evidence-backed context; Composer creates a draft; Validator checks factual support and policy. Each handoff is traceable.

## 5. Human decision and boundaries (45 seconds)

The finished package returns to Slack with rationale, evidence, candidate contacts, and a draft. The AE can edit, approve, or reject. The demo never sends anything. In production, CRM access, contact suppression, Slack signature verification, deduplication, observability, and external write permissions would be handled in deterministic service adapters, not delegated to the model.

## Accuracy note

This repo contains a simulated browser demo plus a CrewAI reference starter on synthetic input. It does not connect to Salesforce, Snowflake, Gong, or Slack. The score formulas and exact Gong tracker inventory need confirmation from their owners.
