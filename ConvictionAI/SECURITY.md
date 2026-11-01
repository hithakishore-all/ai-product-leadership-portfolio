# Security

## Reporting a vulnerability

Please don't open a public issue. Contact the maintainer through the email on their GitHub profile with a description and steps to reproduce. You'll get a reply within a week.

## Handling secrets

- The only secret is your local Postgres password, kept in `.env`. Git ignores `.env`; never commit it.
- `.env.example` contains a placeholder (`CHANGE_ME`) and no real values.
- `ANTHROPIC_API_KEY` is optional and lives in `.env` too. It is read only by the server and never sent to the browser.
- Without the key the app calls no external service. With it, **Research a company** sends only the company name and hint to the Anthropic API.

## Scope and assumptions

- This is a **local demo**. The server binds to `localhost` and has **no authentication**. Don't expose it to a network or the internet as-is; putting it online would need authentication, HTTPS and a hosted database first.
- The API tests and `make db` **drop and rebuild** the `conviction_ai` database. Don't point `DATABASE_URL` at a database holding anything you care about.
- Research output is untrusted: it goes through the same pack validator as an uploaded file, every source URL must be one the agent's web search returned, and researched packs are marked *not yet reviewed*. Research can't overwrite the fictional demo companies.
- SQL is parameterised throughout. Uploaded CSVs are parsed as numbers; uploaded packs are parsed as JSON and validated before any write.
- Demo data is fictional, except ClearOps and its investors, which use only public information with source links. Nothing here is investment advice.
