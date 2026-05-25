# Discord server automation

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

Heron's Discord server is **infrastructure-as-code**. The desired state lives
in one file, [`.github/discord/config.yml`](../.github/discord/config.yml), and
[`scripts/system/apply-discord-config.mjs`](../scripts/system/apply-discord-config.mjs)
reconciles the live server to match it. The
[`maintain-discord.yml`](../.github/workflows/maintain-discord.yml) workflow runs
it on push to `main` (when the config or script change), on a weekly cron (drift
sweep), and on manual dispatch.

Edit the config, push to `main`, the live server converges. No clicking around
in the Discord UI.

## Source of truth + drift

`config.yml` is the single source of truth.

- **Declared resources are reconciled.** Change a managed channel's topic, a
  role's colour, an AutoMod threshold in the UI, and the next run reverts it.
  The weekly cron runs `--verify` and fails red if anything drifted.
- **Strict prune (`prune: true`).** Anything live but *not* declared in
  `config.yml` -- a channel/role/AutoMod rule someone added by hand -- is
  **deleted** on the next `apply`. That makes the server exactly what the file
  says, nothing more. Guardrails: `@everyone` and managed roles (the bot's own,
  integrations, the booster role) are never touched; child channels are deleted
  before their categories; and a safety cap refuses a mass-delete that signals a
  broken/empty config. `--verify` / `--dry` only *report* the prune set.
- Set `prune: false` to keep it additive (correct declared drift, leave manual
  additions alone).

## What it manages

| Area | Details |
|---|---|
| Community feature | **Enabled programmatically** (`PATCH` guild `features += COMMUNITY` + rules/updates channels). Needs an Administrator bot -- see below |
| Server settings | name, description, verification level, default notifications, explicit-content filter, `system_channel_flags` (incl. disabling the "helpful tips for server setup" reminders) |
| Server images | `icon` always; `banner` / `splash` / `discovery_splash` when the guild owns the feature |
| System channel | the channel join/boost notices post to (`server.system_channel`) |
| Server widget | enable + the "invite channel" a widget invite points at |
| Roles | colour, permissions, hoist, mentionable, `unicode_emoji` / `icon` (ROLE_ICONS), plus hierarchy-order drift detection |
| Channels | category layout, topic, slowmode, permission overwrites (two-pass: base channels, enable Community, then announcement/stage channels) |
| AutoMod | full rule reconciliation (keywords, regex, presets, thresholds, actions, exempt roles); the bot is auto-granted access to alert channels |
| Membership screening | the "rules" gate a new member accepts (`rules:` block) |
| Onboarding + Welcome | the native onboarding flow + welcome screen |
| Webhooks | name + avatar for each channel's declared `webhook:` secret (never rotates the URL) |
| Bot profile | the bot's own avatar + banner |
| Prune | deletes undeclared channels/roles/AutoMod rules (`prune: true`) |

## The bot needs Administrator

Full provisioning requires the bot to hold **Administrator**. This is not
gratuitous -- three things are impossible without it:

1. **Managing private channels.** Maintainer-only channels deny `@everyone`
   `VIEW_CHANNEL`. `MANAGE_CHANNELS` does **not** override a VIEW denial -- only
   Administrator does -- so a scoped bot literally cannot see (let alone edit or
   set AutoMod alerts on) those channels.
2. **Enabling Community.** The COMMUNITY feature PATCH `403`s for a scoped bot.
3. **Strict prune.** Deleting a private channel needs access to it.

Grant it one of two ways:

- **Easiest:** Server Settings -> Roles -> the bot's role -> toggle
  **Administrator** ON. No re-invite.
- **Or re-invite** with `permissions=8`:
  `https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=bot%20applications.commands&permissions=8`

A scoped bot (`MANAGE_ROLES`+`MANAGE_CHANNELS`+`MANAGE_GUILD`, integer
`1100316934320`) still runs, but only *partially* provisions: public channels +
non-Community settings. It warns (never hard-fails) on what it can't reach.

> Because the token now grants full server admin, treat it like a private key.
> `reminders.yml` opens a quarterly rotation reminder (see Token rotation).

## Zero-to-live runbook

Going from no server to fully reconciled. Steps 1-4 + 7 are **manual** (no API
exists to automate them); everything else is automated.

1. **Create the bot application** (manual). [Discord Developer
   Portal](https://discord.com/developers/applications) -> New Application ->
   name it (e.g. `Heron Reconciler`) -> **Bot** -> **Reset Token** (copy it;
   shown once). Enable **Server Members Intent** if you want member enumeration.
2. **Invite the bot as Administrator** (manual). OAuth2 -> URL Generator ->
   scopes `bot` + `applications.commands` -> permission **Administrator** ->
   open the URL -> install on the guild.
3. **Drag the bot's role to the top** of Server Settings -> Roles (manual). A
   bot can only manage roles below its own.
4. **Create the 3 release webhooks** (manual; the URLs are secrets CI can't
   mint). Server Settings -> Integrations -> Webhooks -> New Webhook, targeting:
   `#changelog` -> Releases, `#ci-builds` -> Builds, `#security` -> Security.
5. **Set the secrets + variables** (automatable via `gh`):

   ```sh
   gh secret   set DISCORD_BOT_TOKEN        --repo kaelys-js/heron   # from step 1
   gh variable set DISCORD_GUILD_ID         --body '1507162919421612134' --repo kaelys-js/heron
   gh variable set DISCORD_TOKEN_ROTATED_AT --body "$(date -u +%Y-%m-%d)" --repo kaelys-js/heron
   gh secret   set DISCORD_WEBHOOK_RELEASES --repo kaelys-js/heron   # from step 4
   gh secret   set DISCORD_WEBHOOK_BUILDS   --repo kaelys-js/heron
   gh secret   set DISCORD_WEBHOOK_SECURITY --repo kaelys-js/heron
   ```

6. **First reconcile** (automated). `gh workflow run maintain-discord.yml --ref main -f mode=apply`.
   Creates every category/channel/role/AutoMod rule, enables Community, runs
   onboarding/welcome/rules, and prunes anything undeclared. Idempotent after.
7. **Connected Roles** (optional; manual deploy -- see below).

## What's automated vs. manual

| Step | Automated? |
|---|---|
| Reconcile the whole server (channels/roles/AutoMod/onboarding/welcome/widget/images) | Yes, fully |
| Enable Community | Yes, now programmatic (needs Administrator bot) |
| Prune undeclared resources | Yes, `prune: true` |
| Release / build / security webhook posts | Yes, workflows |
| Token-rotation reminder | Reminder yes; the **rotation itself is manual** (no Discord API) |
| Create the bot application | No -- no API to create a Discord app |
| Invite the bot / grant Administrator | No -- manual (OAuth / Roles UI) |
| Create the 3 webhooks | No -- their URLs are secrets |
| Connected Roles endpoint | Partial -- scaffolded; **you deploy + register it** |
| Server Tags ("traits") | No -- no public API (see below) |

## Token rotation

The bot token grants Administrator, so rotate it quarterly. Discord has **no
rotate API** -- it's manual:

1. Developer Portal -> the app -> Bot -> **Reset Token**.
2. `gh secret set DISCORD_BOT_TOKEN --repo kaelys-js/heron`
3. `gh variable set DISCORD_TOKEN_ROTATED_AT --body "$(date -u +%Y-%m-%d)" --repo kaelys-js/heron`
4. Re-run **Maintain Discord** (`mode=verify`) to confirm access.

`reminders.yml` opens a rotation issue when `DISCORD_TOKEN_ROTATED_AT` is unset
or older than 90 days.

## Connected Roles (auto-`@Contributor`)

Discord's linked-roles let a member earn `@Contributor` by proving a merged PR.
It needs a small **public HTTP endpoint** Discord calls during linking, so it
can't be fully automated from CI -- but the scaffold is provided:

- [`scripts/discord/connected-roles/register-metadata.mjs`](../scripts/discord/connected-roles/register-metadata.mjs)
  -- registers the role-connection metadata schema (run once, with the app token).
- [`scripts/discord/connected-roles/worker.mjs`](../scripts/discord/connected-roles/worker.mjs)
  -- a Cloudflare-Worker-style handler: OAuth2 callback -> check the GitHub user
  has a merged Heron PR -> `PUT` the role-connection metadata.

**Deploy (manual):** set `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` /
`GH_TOKEN` on the worker, `wrangler deploy` (or any host), then Developer Portal
-> Linked Roles -> point at the worker URL. Until deployed, assign
`@Contributor` by hand.

### Not settable via the API: Server Tags ("traits")

The Discord **Server Tags** / guild-tag feature (the badge members "wear") has
**no public REST API** as of May 2026 -- only a read-only user-side surface
(`GET /users/{id}.primary_guild`). Configure it in the UI: Server Settings ->
Engagement -> Server Tag. The reconciler intentionally has no code path for it.
Source: [Discord Support -- Server Tags](https://support.discord.com/hc/en-us/articles/31444248479639-Server-Tags).

## Image apply-state

Images are content-hashed so an unchanged asset isn't re-uploaded each run
(Discord rate-limits bot-avatar edits hard). The state (`.image-state.json`,
`{sourceSha, discordHash}` per slot) is **not committed** -- CI can't push to
protected `main` -- and is persisted across runs via an `actions/cache` entry in
`maintain-discord.yml`. A cache eviction costs at most one harmless re-upload.

## Running it

```sh
# Validate the config without touching Discord (token-free):
pnpm verify:discord-config

# Manual reconcile (GitHub UI: Actions -> Maintain Discord -> Run):
#   mode = dry     plan only, no writes (safe to run first; shows the prune set)
#   mode = verify  report drift, exit non-zero if any
#   mode = apply   converge the live server to the config
```

Drift detection (`dry` / `verify`) is read-only; `apply` is the only mode that
writes or deletes.
