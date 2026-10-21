# Publish the GitHub starter

The GitHub-ready source is the whole `gtm-agentic-workflow` folder. It already has a local Git repository and commits. It is not published to GitHub yet.

## Before publishing

- Review the demo and docs for any internal details you don't want public.
- Confirm the repository should be public or private.
- Keep `.env`, API keys, customer records, and internal data extracts out of the repo. `.gitignore` excludes `.env` and local Python environments.
- Select a license only if you want others to reuse the code.

## Publish with GitHub Desktop

1. In GitHub Desktop, choose **Add an Existing Repository** and select this folder.
2. Sign in to your GitHub account if needed.
3. Choose **Publish repository** and choose public/private visibility.
4. Review the file list before publishing.

Alternatively, create an empty GitHub repository and add its remote to this local repo, then push `main`. The current local branch has the interview-demo commits.

## Included code

- Static UI demo: open `demo/index.html`; no runtime install.
- CrewAI reference backend: `src/gtm_agent_studio/`; requires Python and an LLM API key for live generation on synthetic input only.
- No Salesforce, Snowflake, Gong, or Slack integration is implemented.
