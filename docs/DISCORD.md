# Discord server automation

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

Heron's Discord server is reconciled from a single source of truth,
[`.github/discord/config.yml`](../.github/discord/config.yml), by
[`scripts/system/apply-discord-config.mjs`](../scripts/system/apply-discord-config.mjs).
The [`maintain-discord.yml`](../.github/workflows/maintain-discord.yml)
workflow runs it on push to `main` (when the config or script changes), on
a weekly cron (drift sweep), and on manual dispatch.

Edit the config, push to `main`, and the live server converges. No
clicking around in the Discord UI.

## What it manages

| Area | Details |
|---|---|
| Server settings | name, description, verification level, default notifications, explicit-content filter, `system_channel_flags` (incl. disabling the "helpful tips for server setup" reminders) |
| Server images | `icon` always; `banner` / `splash` / `discovery_splash` when the guild owns the feature |
| System channel | the channel join/boost notices post to (`server.system_channel`) |
| Server widget | enable + the "invite channel" a widget invite points at |
| Roles | colour, permissions (least-privilege, see below), hoist, mentionable, `unicode_emoji` / `icon` (ROLE_ICONS), plus hierarchy-order **drift detection** |
| Channels | category layout, topic, slowmode, and **permission overwrites** (member overwrites + roles you don't declare are preserved) |
| AutoMod | full rule reconciliation (keywords, regex, presets, thresholds, actions, exempt roles) |
| Membership screening | the "rules" gate a new member accepts (`rules:` block); needs COMMUNITY |
| Onboarding + Welcome | the native onboarding flow + welcome screen; need COMMUNITY |
| Webhooks | name + avatar for each channel's declared `webhook:` secret (never rotates the URL) |
| Bot profile | the bot's own avatar + banner |

### Not settable via the API: Server Tags ("traits")

As of May 2026 the Discord **Server Tags** / guild-tag feature (the badge
members can "wear", and the server identity "traits") has **no public REST
API**. The only documented surface is read-only on the user side
(`GET /users/{id}` returns `primary_guild`). Configure tags/traits in the
Discord client UI: Server Settings -> Engagement -> Server Tag. The
reconciler intentionally has no code path for it.

Source: [Discord Support -- Server Tags](https://support.discord.com/hc/en-us/articles/31444248479639-Server-Tags).

## One-time maintainer prerequisites

The walkthrough is `pnpm setup:native` step 14. The essentials:

1. **Create a bot application** in the
   [Discord Developer Portal](https://discord.com/developers/applications)
   and copy its token.
2. **Invite the bot with the right permissions.** The reconciler needs at
   minimum `MANAGE_ROLES`, `MANAGE_CHANNELS`, and `MANAGE_GUILD`. The
   recommended invite integer is **`1100316934320`** (those three plus
   `MANAGE_WEBHOOKS`, `VIEW_AUDIT_LOG`, `MODERATE_MEMBERS`):

   ```text
   https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=bot%20applications.commands&permissions=1100316934320
   ```

   If the bot lacks the management permissions, the reconciler prints this
   exact URL and exits before touching anything.
3. **Drag the bot's role to the top** of Server Settings -> Roles. A bot
   can only manage roles *below* its own.
4. **Enable the COMMUNITY feature** (Server Settings -> Enable Community)
   if you want onboarding, the welcome screen, announcement channels, and
   the rules gate. Without it, those pieces are skipped with a notice.
5. **Set the repo secrets + variable:** `DISCORD_BOT_TOKEN` (secret),
   `DISCORD_GUILD_ID` (variable), and the webhook URLs
   `DISCORD_WEBHOOK_RELEASES` / `DISCORD_WEBHOOK_BUILDS` /
   `DISCORD_WEBHOOK_SECURITY` (secrets).

## Least-privilege permissions

A bot can only *grant* permissions it holds itself. The `Maintainer` role
grants `ADMINISTRATOR`; `Reviewer` / `Triager` grant moderation perms. If
you invite the bot without those (the recommended posture), the reconciler:

- applies every permission it **can** grant,
- preserves any elevated bit already set by hand (it never strips a
  manually granted `ADMINISTRATOR`),
- prints a `::warning::` naming each bit it could not grant, so you can set
  it once by hand or re-invite the bot holding it.

The run still succeeds. It does not die on a `50013 Missing Permissions`.

## Feature gates

Some capabilities need a guild feature. When absent, the reconciler skips
that piece with a `::notice::` (never an error):

| Capability | Feature |
|---|---|
| onboarding, welcome screen, rules gate, announcement channels | `COMMUNITY` |
| server banner | `BANNER` |
| invite splash | `INVITE_SPLASH` |
| role icons | `ROLE_ICONS` |
| discovery splash | `DISCOVERABLE` |

## Image apply-state

Images are content-hashed so an unchanged asset isn't re-uploaded each
run (Discord rate-limits bot-avatar edits hard). The state
(`.image-state.json`, `{sourceSha, discordHash}` per slot) is **not
committed** -- CI can't push to protected `main` -- and is persisted
across runs via an `actions/cache` entry in `maintain-discord.yml`. A
cache eviction costs at most one harmless re-upload.

## Running it

```sh
# Validate the config without touching Discord (token-free):
pnpm verify:discord-config

# Manual reconcile (GitHub UI: Actions -> Maintain Discord -> Run):
#   mode = dry     plan only, no writes (safe to run first)
#   mode = verify  report drift, exit non-zero if any
#   mode = apply   converge the live server to the config
```

Drift detection is read-only; `apply` is the only mode that writes.
