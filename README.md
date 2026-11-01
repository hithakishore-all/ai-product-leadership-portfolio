1. **Conviction AI**is an investment-intelligence workspace for VC and PE teams. It takes a deal from “which market is inflecting?” to an IC memo, then on to buy-and-build add-ons, exit readiness and AI growth options for a portfolio company.

Every number is computed by tested code rather than the AI. Conflicting sources are kept side by side, and anything that isn’t public is shown as Missing instead of guessed. The demo story: a pitch deck claims 124% net revenue retention, and the customer data says 113%.

It’s built on Postgres (modelled on Salesforce objects), FastAPI and a one-file React UI, with real companies researched from public sources, including Serent-backed ParentSquare.

▶️ **Watch the demo:**: [Loom walkthrough](YOUR-LOOM-LINK) 

2. ## GTM Orbit · Every account has a next move. Orbit helps you find it.

Sellers spend only about 40% of their time selling, and 69% of B2B buyers double-check AI-generated insights with a rep. More AI isn't the fix. AI that sellers can trust is.

**GTM Orbit turns a ranked account into a cited, validated outreach brief in under a minute, and the seller stays in control.**

- 🔍 **Discover:** finds the buying group, flags missing roles, and never uses opted-out contacts
- 📚 **Research:** pulls only facts with a source and a date from Salesforce, gong call transcripts and product signals
- ✍️ **Compose:** writes the first email, mapping every claim to its evidence
- 🛡️ **Validate:** rejects made-up claims ("Series C", "three new regions") and sends the draft back to be rewritten
- ✅ **Human approval:** only the account owner can approve, and nothing is ever sent automatically
- ⚠️ **Unknown ≠ low:** stale or missing scores are flagged, never hidden as "low priority"
- 🧾 **Full audit trail:** every agent step and human decision is logged in Snowflake
- 💬 **Where sellers work:** the same flow runs in a web console and in Slack (`/orbit brief northstar`)
- 🔐 **Governed by design:** agents read one governed view; the app logs in as a key-pair service user with least-privilege access

**Stack:** Salesforce · Snowflake (agents run in the warehouse) · Slack Bolt · Node.js · runs offline in 2 minutes, no accounts needed

▶️ **Watch the demo:** [Loom walkthrough](YOUR-LOOM-LINK)
