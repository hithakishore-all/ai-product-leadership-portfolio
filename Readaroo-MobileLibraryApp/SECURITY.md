# Security

Readaroo is a portfolio prototype with synthetic data. It has no login and should not be exposed to the internet.

## Rules the code enforces

- Stripe runs in test mode only. A live key (`sk_live_`, `rk_live_`) stops the app at startup.
- The server listens on `127.0.0.1` unless `READAROO_HOST` is set.
- The app's database role (`readaroo_app`) can't create tables or change or delete audit events.
- Instant-borrow spend is checked under a row lock and can never pass a library's cap; database CHECK constraints back this up.
- Request bodies are limited to 50 KB.

## Your part

- Keep `.env` and any keys out of git (they're in `.gitignore`).
- Use a restricted Stripe test key (`rk_test_…`) if you can.
- Never add real people's or children's data.

## Reporting a problem

Open a GitHub issue without secrets in it, or contact the maintainer listed on the repository profile.
