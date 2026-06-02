# Releasing -- the convergent cut-then-promote model

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

Heron ships ONE version to EVERY platform on a single track model: a Release
Please cut goes to BETA everywhere at once, soaks, then auto-promotes to
PRODUCTION everywhere at once with a staged rollout. You never run a release
command -- you write [Conventional Commits](https://www.conventionalcommits.org/)
and the automation does the rest. This doc is the reference for that pipeline:
what fires when, the soak + halt switches, and how to drive each platform's
staged rollout.

## The two phases

```text
  merge release PR ──► Release Please tags vX.Y.Z
                         │
            (release.yml: build-natives)
                         ▼
   ┌─────────────── PHASE 1: CUT → BETA (automatic, every version) ───────────┐
   │  iOS      → TestFlight (Fastlane `beta`)                                  │
   │  Android  → Play internal track (Fastlane `internal`)                     │
   │  Electron → prerelease GitHub release (latest*.yml; betas via allowPrerelease) │
   └──────────────────────────────────────────────────────────────────────────┘
                         │
                  soak (SOAK_DAYS, default 3)
                         │
            (promote.yml: daily schedule)
                         ▼
   ┌──────────── PHASE 2: SOAK → PROMOTE → PRODUCTION (staged) ───────────────┐
   │  iOS      → App Store, submit for review + PHASED release (7-day 1→100%)  │
   │  Android  → Play production, 10% STAGED rollout                           │
   │  Electron → stable latest*.yml + stagingPercentage: 25                    │
   └──────────────────────────────────────────────────────────────────────────┘
                         │
              GitHub release un-prereleased + marked latest (promoted marker)
```

### Phase 1 -- the cut (every version becomes a beta)

When the Release Please PR merges, `release.yml` tags `vX.Y.Z` and calls
`native-release.yml` with just the `version`. That workflow's inputs default to
`channel: beta` + `promote_to_production: false`, so the SAME build goes to
every beta track:

- **iOS** -- `fastlane beta` uploads to TestFlight (internal group; the
  maintainer receives it on-device automatically).
- **Android** -- `fastlane internal` uploads the AAB to the Play internal track.
- **Electron** -- `EP_PRE_RELEASE=true` marks the GitHub Release a prerelease and
  the build publishes `latest.yml`. electron-builder emits only a single
  `latest.yml` for the `github` provider (it never builds a `beta.yml`), so the
  beta/stable split is the prerelease FLAG, not a channel file: beta users
  (`allowPrerelease`, updater channel left at `latest`) read `latest.yml` off the
  prerelease release during the soak; stable users (`allowPrerelease = false`) skip
  the prerelease entirely. `EP_PRE_RELEASE` sets only the prerelease flag --
  `gen-build-info.mjs` reads it to stamp `channel: 'beta'` for the About display.

Nothing reaches production users in Phase 1. A bare tag push (the
`pnpm release patch` escape hatch) has no `channel` input, which also resolves
to beta -- a tag is treated as a cut.

### Phase 2 -- the auto-promote (soaked version → production, staged)

`promote.yml` runs daily on a cron. Its `select` job:

1. Lists every GitHub release (`gh api .../releases`).
2. Checks for an open `release-blocker` issue (a global hold).
3. Checks for open `hold-promotion` issues whose title names a version (a
   per-version hold).
4. Treats every non-prerelease release as "already in production"
   (`promotedVersions`).
5. Feeds all of that to `scripts/system/select-release-to-promote.mjs`
   (`selectReleaseToPromote`), the pure, unit-tested core that decides which
   soaked prerelease (if any) to promote -- the newest version that has soaked
   `≥ SOAK_DAYS`, is not held, is not already promoted, and does not regress
   production.

If a version is selected, the `gate` job pauses for the `production`
Environment's required-reviewer approval, then the `promote` job calls
`native-release.yml` with `channel: stable`, `promote_to_production: true`, and
`staging_percentage: '25'`. That runs the production lanes:

- **iOS** -- `fastlane app_store` submits for review with `phased_release: true`
  (Apple's automatic 7-day 1→100% ramp). Reuses the binary already in TestFlight
  (`skip_binary_upload`).
- **Android** -- `fastlane production` promotes the internal build to the
  production track at `rollout: "0.1"` (10%). No rebuild.
- **Electron** -- NO rebuild. The cut already published `latest*.yml`; the
  `promote-desktop` job injects `stagingPercentage: 25` into those existing channel
  files and re-attaches them, then `finalize` un-prereleases the release so stable
  users start reading `latest.yml` -- the EXACT soaked binary. A rebuild is avoided
  on purpose: it would re-sign to a different hash and, because `artifactName` has
  no channel, clobber the soaked binaries.

After the build succeeds, `finalize` un-prereleases the GitHub release and marks
it latest (`gh release edit --prerelease=false --latest`). That non-prerelease
state is the idempotency marker the selection core reads -- a promoted version is
never picked again.

### Partial failure and retry

The three production lanes (iOS / Android / Electron) run as separate jobs inside
the `native-release.yml` call. If one fails, the `promote` job fails, so
`finalize` does NOT run and the GitHub release stays a prerelease. Because a
prerelease is still an eligible candidate, the next daily `promote.yml` run
re-selects the same version and re-runs ALL three lanes -- an at-least-once
retry, not exactly-once. That is safe for a lane that genuinely did not ship, but
a lane that already succeeded gets re-invoked: e.g. `fastlane app_store` on a
version already submitted for review can error or no-op.

So when a promote partially fails: open a `hold-promotion` issue naming the tag
(stops the automatic retry), finish the failed platform by hand from its console,
then run `promote.yml` with `version` set once the conflict is cleared (or, if all
platforms are actually live, just `gh release edit vX.Y.Z --prerelease=false
--latest` to set the promoted marker and close the loop).

## Channels map to audiences

| Channel | Who gets it | Source of truth |
|---|---|---|
| **beta** | TestFlight testers, Play internal testers, Electron beta-channel users | `latest*.yml` off the GitHub **prerelease** (via `allowPrerelease`) |
| **stable** | App Store, Play production, Electron stable-channel users | `latest*.yml` off the GitHub **latest** (non-prerelease) release |

Electron's **beta channel == TestFlight users** (early adopters who opted into
prereleases); **stable == App Store users** (the general public). Both read the
same `latest*.yml`; the difference is `allowPrerelease` -- a beta user sees it on
the prerelease release during the soak, a stable user only after the promote
un-prereleases it. The `github` provider has no separate `beta.yml`.

## Controls -- soak, holds, kill switch

| Control | What it is | Effect |
|---|---|---|
| `SOAK_DAYS` | Repo variable (default `3`) | Minimum age before a beta is eligible to promote. `gh variable set SOAK_DAYS --body '5'` |
| `release-blocker` label | Open issue with this label | **Global hold** -- freezes ALL promotion until the issue closes |
| `hold-promotion` label | Open issue whose title names a `vX.Y.Z` | **Per-version hold** -- that one version won't promote |
| `production` Environment | GitHub Environment on the `gate` job | Required-reviewer approval before any promote ships -- the kill switch |
| `dry_run` input | `workflow_dispatch` boolean | Logs the selection without promoting |
| `version` input | `workflow_dispatch` string | Promote this exact version, bypassing soak selection |

To **halt all promotion**: open an issue labelled `release-blocker`, or decline
the `production` Environment approval. To **halt one version**: open an issue
labelled `hold-promotion` with the tag (e.g. `vX.Y.Z`) in its title.

## Advancing or halting each platform's staged rollout

Promotion ships a STAGED rollout, not 100%. After promote.yml runs, advance (or
halt) each platform manually:

- **iOS (App Store phased release)** -- App Store Connect → your app → the version
  → *Phased Release for Automatic Updates*. Apple ramps 1→100% over ~7 days. You
  can **Pause** the phased release or **Release to all users** immediately from
  that panel. A halt = pause; a roll-forward = release to all.
- **Android (Play production rollout)** -- Play Console → *Production* → the
  release → *Manage rollout*. Bump the rollout percentage (e.g. 10% → 50% →
  100%) or **Halt rollout** to stop serving the new version to additional
  devices. The 10% start comes from the Fastlane `production` lane's
  `rollout: "0.1"`.
- **Electron (stagingPercentage)** -- the `latest*.yml` channel files carry
  `stagingPercentage: 25`. To advance, re-run `promote.yml` (workflow_dispatch)
  with the same `version` and a higher `staging_percentage`, which re-injects
  and re-attaches the channel files. To halt, set it lower or open a
  `hold-promotion` issue and cut a fix. electron-updater hashes each install on a
  per-machine GUID, so the same fraction stays consistent across update checks.

## Manual operations

- **Manual beta build**: `native-release.yml` → *Run workflow* → `channel: beta`.
- **Manual stable promote**: `promote.yml` → *Run workflow* → set `version` to the
  exact `X.Y.Z`. The `production` gate still applies.
- **Dry-run the selection**: `promote.yml` → *Run workflow* → `dry_run: true`.
- **Tag escape hatch**: `pnpm release patch` pushes a tag directly; the tag-push
  trigger builds it as a beta cut (no `channel` input → beta).

## Source of truth

- `release-please-config.json`, `.release-please-manifest.json` -- versioning.
- `.github/workflows/release.yml` -- the cut (Phase 1 trigger).
- `.github/workflows/native-release.yml` -- the cross-platform build; `channel`,
  `promote_to_production`, `staging_percentage` inputs. `build-desktop` runs on the
  cut only; `promote-desktop` re-channels `latest*.yml` on a promote (no rebuild).
- `ui/electron/src/update-prefs.ts` -- `updaterFlagsForChannel` maps the beta/stable
  choice to `allowPrerelease` (the github provider has no `beta.yml`).
- `.github/workflows/promote.yml` -- the auto-promote-after-soak (Phase 2).
- `scripts/system/select-release-to-promote.mjs` (+ `.test.mjs`) -- the pure
  selection core.
- `ui/ios/App/fastlane/Fastfile` -- `beta` + `app_store` lanes.
- `ui/android/fastlane/Fastfile` -- `internal` + `production` lanes.
- `scripts/native/gen-build-info.mjs` -- channel stamping (`EP_PRE_RELEASE` →
  `beta`).
