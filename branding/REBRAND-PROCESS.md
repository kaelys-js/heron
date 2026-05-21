# Rebrand process

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

> How to change the brand cleanly -- names, colors, fonts, voice, the
> whole identity -- and the protections that stop accidental damage.
>
> The single edit-point is [`brand.json`](./brand.json). `apply-brand`
> propagates from there into every consumer. A drift gate refuses to
> proceed on destructive changes unless you explicitly confirm.

## The mental model

```text
branding/brand.json          ← you edit ONLY this
       │
       ▼
pnpm brand:apply             ← propagates everywhere
       │
       ├──→ Capacitor configs (iOS + Electron)
       ├──→ Electron-builder (DMG / installer copyright + IDs)
       ├──→ Info.plist + entitlements × 5 (App + 4 extensions)
       ├──→ Brand.swift × 5 (App + 4 extensions)
       ├──→ AndroidManifest.xml + build.gradle + Brand.kt
       ├──→ ui/src/lib/client/brand.ts (TS BRAND object)
       ├──→ ui/electron/src/brand.ts (Electron-side BRAND)
       ├──→ ui/static/manifest.webmanifest + favicon.svg
       ├──→ ui/src/app.html + error.html (head + boot fallback)
       ├──→ ui/src/app.css AUTO-GENERATED:brand-tokens block
       │       (@font-face × 8 + @theme inline + :root + .dark)
       ├──→ 4 wordmark SVGs (regenerated from displayName + colors)
       ├──→ 8 branding/*.md files (AUTO-GENERATED:<section> markers)
       ├──→ release-please-config.json + .github/{ISSUE_TEMPLATE,workflows}
       ├──→ ui/ios/App/fastlane/{Appfile,Fastfile}
       ├──→ scripts/native/add-xcode-targets.rb
       ├──→ lefthook.yml + turbo.json paths
       └──→ All platform icons (icons regen via brand.iconSource)
       │
       │  (After commit + push to main, the maintain-config.yml workflow
       │   reconciles GitHub-side state for you:)
       │
       ▼
.github/workflows/maintain-config.yml   ← push:main on branding/brand.json
       │                                  triggers it; weekly cron at
       │                                  Mon 06:13 UTC catches manual drift
       │
       ├──→ Repo description + homepage
       ├──→ Repository topics (set-union with brand.json::repo.topics)
       ├──→ GHAS toggles (secret scanning / push protection / dependabot)
       ├──→ Private Vulnerability Reporting
       ├──→ allow_auto_merge + delete_branch_on_merge + web_commit_signoff_required
       └──→ Branch-protection rulesets (`.github/rulesets/*.json`)

       ▼
branding/.brand-snapshot.json  ← apply-brand records post-state here
```

> **Note.** Local `pnpm brand:apply` is pure file-propagation. GitHub-side
> reconcile happens in CI -- the workflow runs idempotently on push:main
> and again on the weekly Monday cron. To force a sync without
> committing, trigger Actions → "Maintain GitHub config" → Run workflow.

## Day-to-day edits (low risk)

Adjusting colors, refining the tagline, tweaking voice principles,
swapping fonts, updating store-listing copy:

```sh
$EDITOR branding/brand.json
pnpm brand:apply
git add -A -- ':!ui/TODO.md'
git commit
```

apply-brand is idempotent; second consecutive run is a no-op. No
gate fires for these edits.

## Destructive edits (the protection)

Seven fields cannot be reverted at the App Store / installed-user
level. Changing any of them triggers the drift gate.

| Field | What breaks |
|---|---|
| `name` | Package name, mDNS service name, git URL inference, user state prefix |
| `identifiers.bundleId` | **App Store + Play Store identity** (NOT reversible) |
| `identifiers.appGroup` | Shared container between app + widgets / watch |
| `identifiers.urlScheme` | Every external `<oldscheme>://...` deep link |
| `identifiers.serviceType` | Bonjour LAN autodiscovery |
| `identifiers.keychainService` | Passkey credential storage scope |
| `identifiers.capacitorPluginName` | TS ↔ Swift / Kotlin plugin bridge JS name |

When apply-brand detects drift in any of these:

```text
🚨 DESTRUCTIVE rebrand detected

The following fields have changed since the last `pnpm brand:apply`.
These changes have non-reversible consequences:

  identifiers.bundleId  (Bundle ID (App Store + Play Store identifier))
    old: com.heron.app
    new: com.heron.test

Consequences:
  • App Store Connect: bundle ID changes are NOT reversible. New bundle ID
    = new App Store entry. Reviews / ratings / TestFlight tester history
    stay with the old app.
  …

If you intend to proceed:
  REBRAND_CONFIRMED=1 pnpm brand:apply
```

The script exits 1. No files are written. Lint hooks won't see drift
because no consumer was touched.

## Confirming a real rebrand

```sh
$EDITOR branding/brand.json    # change the destructive fields
REBRAND_CONFIRMED=1 pnpm brand:apply
```

apply-brand then:

1. Runs the full propagation (every consumer config updates).
2. Writes `branding/MIGRATION-<today>.md` -- auto-generated audit log of
   every destructive field that changed, with the consequences and the
   manual steps you must take outside the repo.
3. Updates `branding/.brand-snapshot.json` to record the new applied
   state so the next non-destructive edit doesn't re-trip the gate.

Commit the MIGRATION doc alongside the brand.json change:

```sh
git add branding/brand.json branding/.brand-snapshot.json branding/MIGRATION-*.md
git commit -m "feat(brand)!: rebrand to <NewName>"
```

The `!` in the commit prefix tells Release Please to cut a major
release; combined with a `BREAKING CHANGE:` footer in the commit body,
the changelog flags the rebrand clearly.

## External steps -- what apply-brand CANNOT do for you

External systems live outside the repo. The MIGRATION doc auto-emits
a summary; this section is the full checklist.

### GitHub repository state -- automated via `maintain-config.yml`

What used to be 6+ manual GitHub-UI clicks is now reconciled by a single
workflow. Edit `brand.json::repo` (description, homepage, topics), commit,
and push to `main` -- `.github/workflows/maintain-config.yml` calls
`gh api` to upsert:

| GitHub-side state | Source of truth |
|---|---|
| Repo description + homepage | `brand.json::repo.{description,homepage}` |
| Topics | `brand.json::repo.topics` (set-union -- applies as authoritative list) |
| Security toggles (secret scanning, push protection, Dependabot) | hard-coded "enabled" in apply-github-config.mjs |
| Private Vulnerability Reporting | hard-coded "enabled" |
| `allow_auto_merge` / `delete_branch_on_merge` / `web_commit_signoff_required` | hard-coded "true" |
| `has_discussions` / `has_issues` | hard-coded "true" |
| Branch-protection rulesets | `.github/rulesets/*.json` (matched by `name` field) |

The workflow is idempotent -- re-running is a no-op unless something
drifted. Trigger it manually with mode=check to dry-run, or mode=apply
to reconcile (Actions → "Maintain GitHub config" → Run workflow).

### Local working tree + GitHub (still manual)

A handful of GitHub operations cannot live behind the SSOT because they
are either too sensitive (visibility flips) or affect git history that
apply-brand should never touch (rename, ownership transfer).

```sh
# 1. Rename the GitHub repo — maintain-config.yml does NOT do this (too
#    destructive for an idempotent reconciliation workflow):
gh repo rename <new-name> --repo <old-owner>/<old-name>

# 2. If also moving to a new GitHub org:
#    Transfer ownership via Settings → Transfer (new org must exist first).
#    Wait ~30s, then trigger Actions → "Maintain GitHub config" → Run
#    workflow → mode=apply to re-apply topics + rulesets in the new namespace.

# 3. Update the local remote URL (git doesn't follow GitHub's redirect):
git remote set-url origin git@github.com:<new-owner>/<new-name>.git
git remote -v

# 4. Optional: rename the local working tree directory:
mv ~/<old-dir> ~/<new-dir>
cd ~/<new-dir>

# 5. Now run apply-brand — it propagates the new brand to every local file.
#    Commit + push, and maintain-config.yml will reconcile GitHub-side state
#    in the renamed repo:
REBRAND_CONFIRMED=1 pnpm brand:apply
```

> **Visibility flips.** `maintain-config.yml` deliberately does NOT touch
> public/private visibility. Flipping a repo public is a one-way trip
> (search engines crawl, forks spread) -- it requires explicit
> maintainer intent, not silent automation. Use the GitHub UI or `gh
> repo edit --visibility public`.

### App Store Connect (Apple)

**Bundle ID is locked.** The most important external constraint of a
rebrand -- Apple does not allow changing the bundle ID of a published
app. Options when the bundle ID changes:

- **Keep the old app as legacy.** The old App Store entry stays alive
  at the old bundle ID. Reviews, ratings, TestFlight history, download
  counts all stay with it. The new bundle ID gets a fresh App Store
  Connect entry.
- **Mark old as deprecated.** Apple supports "Removed from sale" status
  -- users who already installed keep using it; new users can't find it.
- **In-app migration banner** on the old app pointing users at the new
  App Store entry (manual code; not covered by apply-brand).

App Store Connect steps for the new bundle ID:

1. App Store Connect → My Apps → "+ New App"
2. Bundle ID = pick the new value (must match
   `brand.json::identifiers.bundleId`)
3. Re-upload screenshots, metadata, privacy nutrition labels.
4. Re-invite TestFlight testers (cannot migrate from old app's tester
   pool).
5. Submit for review.

ASO (App Store Optimization) implications: keyword history, ranking,
click-through-rate data resets. Plan to lose 2-4 weeks of ASO
performance during the transition.

### Google Play Console (Android)

`applicationId` is locked the same way as iOS bundle ID. Same plan:
old `applicationId` stays as legacy, new `applicationId` = new Play
Console listing. Re-upload AAB, metadata, screenshots. Re-invite
internal testers.

### DNS + email + domains

If `brand.json::homepageUrl` / `supportEmail` changes domain:

- Register the new domain.
- DNS: A / AAAA / CNAME records for the new website, MX for email.
- Email forwarding: `hello@<newbrand>` → existing mailbox.
- SPF / DKIM / DMARC records on the new domain.
- Move landing-page hosting (Vercel / Netlify / GitHub Pages).

### OAuth / Better Auth callbacks

Better Auth's GitHub OAuth integration uses callback URLs scoped to
the OAuth app. If the OAuth app's name / homepage changes:

- GitHub OAuth Apps → Settings → update Application name + Homepage URL.
- Authorization callback URL: keep the existing values unless the
  underlying domain changes.
- Generate new client secret (recommended on rebrand -- invalidates any
  leaked secret).

Other integrations (Stripe, Sentry, Linear, Discord, etc.) need similar
profile updates.

### Discord server + community

- Server Settings → Overview → server name.
- Update invite link description, channel topics, category names
  referencing the old brand.
- Bot integrations: GitHub webhooks pointing at Discord may need
  re-authorizing under the new repo URL.

### Search engines + SEO

- Google Search Console: add the new domain as a separate property.
- Sitemap: regenerate if the marketing site moved.
- 301 redirects from old domain → new domain (preserves SEO equity).
- Update structured data (schema.org JSON-LD) referencing the brand.

### Social handles

- Twitter / X handle change (if available).
- LinkedIn page rename.
- GitHub org rename (if owning an org, not a personal repo).
- Mastodon / Bluesky handles.
- npm package name change (if published -- `npm deprecate` the old,
  publish under the new).

### Trademark + legal

If the brand is registered as a trademark:

- USPTO TEAS application for the new name.
- Domain ownership + protection (typo-squat watching service).
- Update `LICENSE` copyright holder if the legal entity changes.
- `docs/TRADEMARK.md` policy text references the brand by name --
  apply-brand regenerates the relevant data sections; the narrative
  may need a manual sweep.

### Notify existing users

- Email blast to the user mailing list (if any).
- In-app banner on the OLD bundle ID app pointing users at the new
  App Store / Play Store entry.
- Blog post on the website explaining the rename.

### Capacitor-synced webview caches

`ui/ios/App/App/public/` and `ui/android/app/src/main/assets/public/`
hold a cached SvelteKit build referenced by the iOS / Android shell.
Refresh after rebrand:

```sh
pnpm exec cap sync ios
pnpm exec cap sync android
```

### Verification checklist

After running through the above:

- [ ] `git remote -v` shows the new URL.
- [ ] `cd <new-dir> && pnpm brand:apply` runs cleanly (no drift).
- [ ] Trigger Actions → "Maintain GitHub config" → Run workflow → mode=check; step summary reports `✓ Repo state matches SSOT` (live GitHub matches `brand.json` + `.github/rulesets/`).
- [ ] `pnpm exec vitest run capacitor.integration.test.ts` passes.
- [ ] `pnpm visual:diff` reports no regressions (UI hasn't shifted under the new brand).
- [ ] iOS simulator launches under the new bundle ID:
      `cd ui && pnpm exec cap run ios`
- [ ] Android emulator launches under the new applicationId:
      `cd ui && pnpm exec cap run android`
- [ ] Web manifest theme color, app name, icon all updated -- visit
      `http://localhost:5173` and inspect the head.
- [ ] App Store Connect new entry exists + is "Ready for Submission".
- [ ] Play Console new entry exists + has an internal-test build.
- [ ] DNS resolves for the new domain.
- [ ] OAuth callbacks work end-to-end.
- [ ] Discord server has the new name.
- [ ] Social handles updated where available.
- [ ] Search Console knows about the new domain.

## Bypassing the gate (emergency)

For CI experiments / synthetic rebrand testing:

```sh
REBRAND_CONFIRMED=1 pnpm brand:apply
```

The MIGRATION doc still gets generated. If you don't want the
MIGRATION file in the working tree (e.g., during a vitest run), delete
it afterward.

## Snapshot file

`branding/.brand-snapshot.json` is the previous-state cache. It's a
verbatim copy of brand.json from the last successful apply-brand run.
The drift check compares fresh `brand.json` against this snapshot.

**Commit this file.** It's the protection's source of truth -- a
collaborator who clones a fresh repo without the snapshot would never
see the gate fire on their first apply-brand run.

If the snapshot ever gets out of sync (e.g., manual brand.json edit +
forgot to run apply-brand), regenerate by running apply-brand once
under REBRAND_CONFIRMED=1 to re-sync.

## Integration test

`ui/src/lib/integration/capacitor.integration.test.ts` contains the
drift-gate TDD verification:

- non-destructive change runs cleanly
- destructive change without env-var exits non-zero with a useful error
- destructive change with `REBRAND_CONFIRMED=1` succeeds + emits MIGRATION
- `DESTRUCTIVE_FIELDS` list covers all 7 App-Store-locked identifiers

Run it before merging any change to the drift-gate logic:

```sh
pnpm --filter=ui exec vitest run src/lib/integration/capacitor.integration.test.ts
```

## Adding a new destructive field

If a new identifier joins the "cannot be reverted" club (e.g., a new
shared keystore name), add it to `DESTRUCTIVE_FIELDS` at the top of
`scripts/native/apply-brand.mjs` AND to the integration test's
expected list AND to the consequences enumerated in `printDriftReport`
+ `generateMigrationDoc`. The single source of truth for "what is
destructive" lives in apply-brand.mjs.

## Adding a non-destructive consumer

If you add a new file that derives from brand.json (e.g., a `social.json`
post-publishing config):

1. Add an `applyXxx(brand)` function to `scripts/native/apply-brand.mjs`.
2. Call it from the main `apply()`.
3. Add a verification to `ui/src/lib/integration/capacitor.integration.test.ts`
   asserting the file matches `brand.json`.

Apply-brand is the consumer-propagation surface; the test is the
drift-detection net.
