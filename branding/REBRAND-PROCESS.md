# Rebrand process

> How to change the brand cleanly — names, colors, fonts, voice, the
> whole identity — and the protections that stop accidental damage.
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
       ├──→ 10 branding/*.md files (AUTO-GENERATED:<section> markers)
       ├──→ release-please-config.json + .github/{ISSUE_TEMPLATE,workflows}
       ├──→ ui/ios/App/fastlane/{Appfile,Fastfile}
       ├──→ scripts/native/add-xcode-targets.rb
       ├──→ lefthook.yml + turbo.json paths
       └──→ All platform icons (icons regen via brand.iconSource)

       ▼
branding/.brand-snapshot.json  ← apply-brand records post-state here
```

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
2. Writes `branding/MIGRATION-<today>.md` — auto-generated audit log of
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

## What apply-brand CANNOT do for you

External systems live outside the repo. The MIGRATION doc enumerates
them; the highlights:

### App Store Connect (Apple)

- Bundle ID lock is **non-negotiable**. A published app cannot have its
  bundle ID changed. New bundle ID = a new App Store Connect entry,
  losing ratings, reviews, TestFlight tester history, App Store
  Optimization (ASO) ranking, screenshot reviews.
- Plan: keep the old entry as legacy (mark deprecated), create new
  entry for the new bundle ID, migrate users via in-app banner.

### Google Play Console (Android)

- `applicationId` lock is the same as iOS. Same plan.

### GitHub (repo URL)

- Repo rename from Settings → Repository name. GitHub auto-redirects
  for a while, but external bookmarks / RSS feeds / SEO indexing
  should be updated.
- Update local clone:
  ```sh
  git remote set-url origin git@github.com:<new-org>/<new-repo>.git
  ```
- Optional: rename the local working tree directory:
  ```sh
  mv ~/<old-name> ~/<new-name>
  ```

### Domain + email

- DNS for the new homepageUrl / supportEmail domain must be set up.
- Update email forwarding (`hello@newbrand.com` → mailbox).
- Update OAuth callback URLs if Better Auth integrates with external
  providers (GitHub OAuth app, etc.).

### Capacitor-synced webview caches

- `ui/ios/App/App/public/` and `ui/android/app/src/main/assets/public/`
  hold a cached SvelteKit build referenced by the iOS / Android shell.
- Refresh after rebrand:
  ```sh
  pnpm exec cap sync ios
  pnpm exec cap sync android
  ```

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

**Commit this file.** It's the protection's source of truth — a
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
