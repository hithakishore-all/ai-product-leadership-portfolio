# Slack setup (optional)

This guide sets up GTM Orbit in Slack, so you can type `/orbit` to see your ranked accounts, discover missing
contacts and get an outreach brief, all in Slack. It takes about 10 minutes.

The Slack bot works in **both** offline and live mode. You can try it with the offline snapshot before setting up
Snowflake.

[← Back to README](../README.md)

## How it connects

The bot uses **Socket Mode**: your local server opens an outbound connection to Slack. You don't need a public URL,
a tunnel or open ports. The bot only runs while `npm start` or `npm run offline` is running on your machine.

It needs two tokens:

| Token | Starts with | Where it comes from | Used for |
| --- | --- | --- | --- |
| Bot User OAuth Token | `xoxb-` | **Install App** page, after installing | Posting messages, opening modals |
| App-level token | `xapp-` | **Basic Information → App-Level Tokens** | Opening the Socket Mode connection |

## Step 1: Create the app from the manifest

The manifest in `orbit/slack-manifest.yml` defines everything for you: the `/orbit` command, the bot user, the
permission scopes, interactivity and Socket Mode.

1. Go to https://api.slack.com/apps and click **Create New App**, then **From a manifest**.
2. Pick your workspace. Use one where you're allowed to install apps; a free workspace you own works.
3. Choose **YAML**. Replace the sample with the full contents of `orbit/slack-manifest.yml`. To copy it on a Mac:
   `pbcopy < orbit/slack-manifest.yml`.
4. Click **Next**, review the summary, then click **Create**.

The app asks for these bot scopes:

| Scope | Why |
| --- | --- |
| `commands` | The `/orbit` slash command |
| `chat:write` | Post the queue, progress, briefs and audit trails |
| `chat:write.public` | Post in public channels without being invited first |
| `app_mentions:read` | Respond to `@GTM Orbit ...` |

## Step 2: Install it to your workspace

In the app's left menu, open **Install App**, click **Install to Workspace**, then click **Allow**.

Copy the **Bot User OAuth Token** (starts with `xoxb-`).

## Step 3: Create the app-level token

1. Open **Basic Information** and scroll to **App-Level Tokens**.
2. Click **Generate Token and Scopes**.
3. Name it `socket`, click **Add Scope**, choose `connections:write`, then click **Generate**.
4. Copy the token (starts with `xapp-`).

## Step 4: Add both tokens to `.env`

From `GTM_Orbit/`:

```bash
cp .env.example .env     # only if you don't have a .env yet
```

Open `.env` in any text editor and fill in both lines:

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

Save the file. Treat both tokens like passwords: `.env` is git-ignored, so never paste them anywhere else.

## Step 5: Restart Orbit

```bash
cd orbit
npm run offline     # or: npm start for live Snowflake data
```

The terminal should print `Slack bot: on (type /orbit in Slack)`, and the web console header shows
**Slack connected**.

## Step 6: Try it

Use a **public channel**, for example a new `#account-briefs`. In a private channel, first run
`/invite @GTM Orbit`.

```
/orbit                     today's ranked accounts
/orbit account northstar   account summary with cited signals
/orbit contacts verdant    who can be contacted, who can't and why, missing roles
/orbit brief northstar     run the agents and get a brief to approve
/orbit reset               clear demo runs
/orbit help
```

You can also mention the bot: `@GTM Orbit brief juniper`.

What to expect for `/orbit brief northstar`:

1. A progress message updates in place as Discover, Research, Compose and Validate run. You'll see Validate fail
   once, then pass.
2. The brief arrives with **Approve**, **Edit draft**, **Reject** and **View audit trail**.
3. **Edit draft** opens a modal. Your edit is saved as a new draft version.
4. **View audit trail** posts every step in a thread.

**Owner rule.** The first Slack user who uses Orbit becomes the owner of the demo accounts (live mode stores this
in `APP.AE_DIRECTORY`). Only that user can prepare and approve briefs; others get a private notice. To hand
ownership to someone else in live mode, run:

```sql
UPDATE GTM_DEMO.APP.AE_DIRECTORY SET SLACK_USER_ID = NULL;
```

The next person to use Orbit then becomes the owner. In offline mode, restarting the server resets the owner.

## Changing the app later

If you edit `slack-manifest.yml`, open **App Manifest** in the app settings, paste the new version and save.
If Slack asks you to reinstall the app, do so; the bot token usually stays the same.

## Remove the app

Go to https://api.slack.com/apps, open **GTM Orbit**, then **Basic Information → Delete App**. Then delete both
tokens from `.env`.

Having trouble? See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#slack).
