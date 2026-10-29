# Security

## Reporting a vulnerability

Please don't open a public issue. Contact the maintainer through the email on their GitHub profile with a description and steps to reproduce. You'll get a reply within a week.

## Handling secrets

- The only secret is your local Postgres password, kept in `.env`. Git ignores `.env`; never commit it.
- `.env.example` contains a placeholder (`CHANGE_ME`) and no real values.
- The app calls no external service at runtime, so there are no API keys.

## Scope and assumptions

- This is a **local demo**. The server binds to `localhost` and has **no authentication**. Don't expose it to a network or the internet as-is; putting it online would need authentication, HTTPS and a hosted database first.
- The API tests and `make db` **drop and rebuild** the `conviction_ai` database. Don't point `DATABASE_URL` at a database holding anything you care about.
- SQL is parameterised throughout. Uploaded CSVs are parsed as numbers; uploaded packs are parsed as JSON and validated before any write.
- Demo data is fictional, except ClearOps and its investors, which use only public information with source links. Nothing here is investment advice.
