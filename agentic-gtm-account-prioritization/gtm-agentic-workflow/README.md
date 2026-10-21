# GTM Agent Studio

A public-safe interview concept for an account-intelligence and AE-preparation workflow. **Salesforce + Gong → Snowflake → account scoring → CrewAI Flow/Crew → Slack.** Salesforce is the source of record for all accounts; Gong is a conversation-data input; Slack is the AE control surface.

## Preview the interface

Open [`demo/index.html`](demo/index.html) in a modern browser. The page has synthetic accounts, simulated agent events, a Slack-style review card, and no external integrations.

## Run the CrewAI reference starter

The optional Python backend invokes a real configured model using only the fictional fixture in `sample-data/sample-account.json`. It does not connect to Salesforce, Snowflake, Gong, Slack, contact vendors, or email.

1. Use Python 3.10 or newer and create a virtual environment.
2. Install dependencies: `pip install -r requirements.txt`.
3. Copy `.env.example` to `.env` and set a supported provider API key and model.
4. From the repository root, run: `PYTHONPATH=src python -m gtm_agent_studio.run_demo`.

Never put a real customer account, contact record, or credential in the public repo. The demo does not send outreach.

## Architecture and walkthrough

- [`docs/account-prioritization-and-agent-architecture.svg`](docs/account-prioritization-and-agent-architecture.svg) — Salesforce/Gong data inputs, Snowflake foundation, scores, CrewAI multi-agent flow, and Slack AE interface.
- [`docs/architecture.md`](docs/architecture.md) — system/data layers, agent contracts, and guardrails.
- [`docs/account-prioritization-spec.md`](docs/account-prioritization-spec.md) — named score inputs and source-confirmation points.
- [`docs/interview-walkthrough.md`](docs/interview-walkthrough.md) — a four-minute interview narrative.
- [`docs/claude-artifact-prompt.md`](docs/claude-artifact-prompt.md) — prompt for recreating or iterating the Artifact.
- [`docs/claude-upload-guide.md`](docs/claude-upload-guide.md) — which files to give Claude.

## What is simulated

The browser prototype animates the flow locally. The Python example is a CrewAI reference starter, not a production integration. Score formulas/weights, exact Gong tracker inventory, Snowflake views, Slack app, identity/access, and external send adapter are not included. The score is model-owned; the agents explain and prepare work from supplied context, not recalculate the score.

## License

No license has been selected. Choose one before inviting reuse.
