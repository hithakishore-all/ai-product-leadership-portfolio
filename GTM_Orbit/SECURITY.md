# Security

## Reporting a vulnerability

Please don't open a public issue for security problems. Use GitHub's **Report a vulnerability** button on the
repository's **Security** tab (private vulnerability reporting). Include steps to reproduce and the affected
files. You'll get a reply within a few days.

## Handling secrets

- Never commit `.env` or anything in `.keys/`. Both are git-ignored.
- If a Slack token leaks, regenerate it at https://api.slack.com/apps (**Install App → Reinstall** rotates the bot
  token; **Basic Information → App-Level Tokens** lets you revoke and recreate the app token).
- If the Snowflake private key leaks, create a new key pair and run
  `ALTER USER GTM_SLACK_BOT SET RSA_PUBLIC_KEY = '<new key>';` (or `UNSET RSA_PUBLIC_KEY` to disable it at once).

## Scope and assumptions

GTM Orbit is a local demo and reference design:

- The web console has no authentication and binds to `127.0.0.1` by default. Don't expose it to a network
  without adding authentication in front of it.
- The demo maps all accounts to one owner. Production would use per-user identity (SSO) for both the web console
  and Slack.
- No code path sends email or contacts customers.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security-model) for the full security model.
