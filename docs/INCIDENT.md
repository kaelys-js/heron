# Incident response runbook

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

What to do when something goes wrong on the public-facing surface of
`kaelys-js/heron`. Each scenario lists the playbook + the exact
commands.

## Spam flood in Issues / Discussions / PRs

**Symptom:** a wave of low-quality issues, bot-generated PRs, off-topic
discussion posts.

**Playbook:**

1. **Limit interactions** -- `gh api -X PUT /repos/kaelys-js/heron/interaction-limits -F limit=existing_users -F expiry=one_day`
2. **Block the offending users** -- via UI (Settings -> Moderation -> Blocked users) or `gh api -X PUT /users/blocks/{username}`. The block prevents them from interacting with any of your repos for 24h+.
3. **Delete spam content** -- if it's clearly spam, delete it (don't lock + leave it). For borderline cases, lock the conversation with a one-line explanation.
4. **Report to GitHub** -- if it's coordinated, file a [content abuse report](https://github.com/contact/report-abuse).
5. **Document in this file** if the pattern is novel + we should pre-stage detection.

## Released a broken version

**Symptom:** `release-please` cut a release that's missing a critical
fix / has a regression / signed binaries don't load.

**Playbook:**

1. **Mark the GitHub Release as pre-release** -- `gh release edit vX.Y.Z --prerelease`. This stops it from being surfaced as "Latest" but keeps the artifacts available.
2. **Yank from TestFlight** -- in App Store Connect, click "Expire build" on the broken iOS build. Users with the app installed are unaffected (Apple keeps the on-device copy); new TestFlight installs go to the previous build.
3. **Roll forward** -- write a `fix:` commit + push to main. Release Please will cut a patch release with the fix. Don't try to delete the broken release.
4. **If it's a security-vulnerability release**, follow `.github/SECURITY.md` (private vulnerability reporting) AND post a public note on the release page so users know to upgrade.

## Secret leaked

**Symptom:** secret scanning push protection alerts; you see a secret in a public commit; a user reports a leak.

**Playbook:**

1. **Rotate the secret IMMEDIATELY** -- whatever it is (API key, signing cert, password). The git history is the lowest-priority cleanup; the live key is the actual risk.
2. **Update the `data/users/{uid}/profiles/_shared/secrets.json` template** if relevant.
3. **`git push --force-with-lease`** to scrub the secret from the branch (only if the leaked commit isn't on main yet). If it's on main, don't try to scrub history -- assume the secret is public from the moment of push and rotate.
4. **Open a private security advisory** if a user reported it. Coordinate disclosure timing.

## CI gate broken (unable to merge anything)

**Symptom:** a required status check is failing for an environmental reason (CI infra outage, downstream service down) but the code is fine.

**Playbook:**

1. **Confirm it's environmental** -- look at the failing check log. If the failure is a code issue, fix the code instead.
2. **Open the auto-fix path first** -- can pre-push hooks or `pnpm format` solve it? Run `gh pr checks N --watch` to see the live state.
3. **Admin merge as last resort** -- `gh pr merge N --admin`. This bypasses the failing check. Use sparingly (audit log records every admin merge); pair with a follow-up issue describing why bypass was needed.
4. **Disable the broken check temporarily** -- ONLY if it's stuck-failing and will need an actual CI fix. Edit `.github/rulesets/main.json` to remove the context from `required_status_checks` -> commit -> `pnpm gh:apply`. Re-add after the underlying CI is fixed.

## Bot account compromised / impersonation

**Symptom:** a bot account on the repo (CodeRabbit, Codecov, Dependabot, the welcome bot, etc.) starts behaving badly or a new account impersonates one.

**Playbook:**

1. **Revoke OAuth tokens** -- Settings -> Applications -> Authorized OAuth Apps. Revoke + re-authorize the legitimate bot.
2. **Check installations** -- Settings -> Integrations -> Installed GitHub Apps. Suspend any installation you didn't authorize.
3. **Audit recent CI runs** for any suspicious activity (unexplained workflow_run events, unexpected secret usage).
4. **Rotate all secrets** the bot had access to (GITHUB_TOKEN auto-rotates per run; long-lived org secrets need manual rotation).

## Discord webhook firing on noise / wrong events

**Symptom:** the Discord channel is flooded with release / discussion notifications, or fires on events you didn't subscribe to.

**Playbook:**

1. **Edit the webhook scope** -- Settings -> Webhooks -> select the webhook -> "Which events would you like to trigger this webhook?" -> trim down to release + discussion only.
2. **Re-deliver missed events** if the webhook went silent unexpectedly -- "Recent Deliveries" tab -> click a failed delivery -> "Redeliver".

## TestFlight build failed mid-deploy

**Symptom:** `native-release.yml` cut a tag, builds + signs successfully, but TestFlight upload fails.

**Playbook:**

1. **Check the run log** -- usually a stale `APP_STORE_CONNECT_PRIVATE_KEY` (Apple rotates the key chain every ~30 days). Refresh via `pnpm doctor:native`.
2. **Re-run the workflow** -- `gh run rerun <run-id> --failed-only` after the secret refresh.
3. **If Apple is the problem** (App Store Connect outage), wait. The signed `.ipa` is already produced; you can manually upload via Xcode -> "Distribute App" if Apple's API is intermittently down.

## Where to learn more

- `.github/SECURITY.md` -- private vulnerability reporting
- `.github/CODE_OF_CONDUCT.md` -- enforcement actions
- `.github/CONTRIBUTING.md` -- contribution flow
- `docs/CI.md` -- gate inventory + bypass paths
- `docs/SETTINGS.md` -- runbook for repo settings
- `docs/GOVERNANCE.md` -- decision-making model
