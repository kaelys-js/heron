# Plan vs Reality Audit — `tidy-zooming-rabbit.md`

This is the systematic audit the user asked for: **every task and sub-task** from `/Users/home/.claude/plans/tidy-zooming-rabbit.md` checked against the actual code on disk as of 2026-05-14, after the prior session's commits landed.

The earlier `docs/phase9-final-verification.md` claimed "47 atomic tasks complete." That was inaccurate. This document is the truth. Gaps are listed by priority so they get filled in order.

## Phase 1 — Vitest foundation (Tasks 1.1 – 1.9)

| Task | Plan | Reality | Status |
|---|---|---|---|
| 1.1 | Install root + ui workspace test deps | All present, vitest@4.1.6 | ✅ |
| 1.2 | `ui/vitest.config.ts` | Present, thresholds set | ✅ |
| 1.3 | `ui/vitest.workspace.ts` (4 projects + 1 ui-integration) | 5 projects present | ✅ |
| 1.4 | `ui/src/test-setup.ts` (jest-dom, MSW, matchMedia, $env, Capacitor, crypto, IDB) | Present, all present, + DB-isolation env-var override | ✅ |
| 1.5 | `ui/src/test-helpers/` (render, msw-handlers, state-helpers, fs-fixtures) | All 4 files present | ✅ |
| 1.6 | Workspace package.json scripts | Present: test, test:watch, test:ui, test:coverage | ✅ |
| 1.7 | Turbo task graphs for test, test:watch, test:coverage, test:ios | All present | ✅ |
| 1.8 | Lefthook `pre-push` `vitest` step | Present | ✅ |
| 1.9 | Phase 1 e2e verify | svelte-check 0/0/0, biome clean, pre-push gate works | ✅ |

**Phase 1: 9/9 ✅**

## Phase 2 — TS/Svelte test suites (Tasks 2.1 – 2.29)

| Task | Module | Plan cases | Actual file(s) | Status |
|---|---|---|---|---|
| 2.1 | `lib/utils.ts` | ≥ 18 | `utils.test.ts` + `utils.dense.test.ts` + `utils.property.test.ts` | ✅ |
| 2.2 | `lib/validators.ts` | ≥ 25 | `validators.test.ts` + dense | ✅ |
| 2.3 | `lib/types.ts` | ≥ 12 | `types.test.ts` + dense | ✅ |
| 2.4 | `lib/api.ts` (MSW) | ≥ 30 | `api.test.ts` + dense | ✅ |
| 2.5 | `lib/client/online-status.svelte.ts` | ≥ 14 | `online-status.test.ts` + dense | ✅ |
| 2.6 | `lib/client/backend-discovery.ts` | ≥ 16 | `backend-discovery.test.ts` + dense | ✅ |
| 2.7 | `lib/client/error-reporter.ts` | ≥ 12 | `error-reporter.test.ts` | ✅ |
| 2.8 | `lib/notifications.svelte.ts` | ≥ 22 | `notifications.test.ts` + dense | ✅ |
| 2.9 | `lib/confirm.svelte.ts` | ≥ 10 | `confirm.test.ts` + dense | ✅ |
| 2.10 | `lib/sidebar-pins.svelte.ts` | ≥ 14 | `sidebar-pins.test.ts` + dense | ✅ |
| 2.11 | `lib/global-actions.svelte.ts` | ≥ 10 | `global-actions.test.ts` | ✅ |
| 2.12 | `lib/theme.svelte.ts` | ≥ 8 | `theme.test.ts` + dense | ✅ |
| 2.13 | `lib/config/branding.ts`, `lib/config/cli.ts` | ≥ 16 | `branding.test.ts` + dense + `cli.test.ts` | ✅ |
| 2.14 | `lib/hooks/use-is-mobile.svelte.ts` | ≥ 8 | `use-is-mobile.test.ts` | ✅ |
| 2.15 | server batch 1 (auth, profiles, job-resolver, keyword-match, followup-cadence) | ≥ 75 | All 5 covered (auth.test.ts 25 + profiles.test.ts 19 + job-resolver.test.ts 11 + keyword-match.test.ts + followup-cadence.test.ts 17) | ✅ |
| 2.16 | server batch 2 (apply-dispatcher, apply-failures, apply-counter, quality-checks, cv-pdf, interview-schedule) | ≥ 60 | All 6 covered (apply-dispatcher.test.ts 26 + apply-failures.* + apply-counter.* + quality-checks.test.ts 15 + cv-pdf.test.ts 8 + interview-schedule.test.ts 18) | ✅ |
| 2.17 | server batch 3 (portals, scan-history, linkedin-audit, email-reactor, orchestrator, comp-benchmark, ui-prefs, api-helpers, auth-helpers, projects) | ≥ 80 | 8 of 10 covered (portals 15 + scan-history 12 + linkedin-audit 17 + comp-benchmark 14 + ui-prefs 18 + api-helpers + auth-helpers + projects 24). **email-reactor + orchestrator still pending** | ⚠️ |
| 2.18 | `hooks.server.ts` | ≥ 18 | hooks.server.test.ts — 28 cases (full middleware chain) | ✅ |
| 2.19 | routes/api batch 1 (read endpoints) | ≥ 55 across 11 endpoints | 9 endpoints covered (health 11 + stats 7 + settings 10 + notifications 4 + projects 8 + autopilot 5 + notifications/clear 3 + onboarding/step 6 + issues 7). **~15 endpoints still pending** | ⚠️ |
| 2.20 | routes/api batch 2 (mutation endpoints) | ≥ 65 across 11+ endpoints | Covered with the above (settings POST, projects POST, autopilot POST, onboarding/step POST, issues POST/DELETE, notifications/clear POST). **~10 endpoints still pending** | ⚠️ |
| 2.21 | ResponsiveAction* primitives | ≥ 35 | None (4 component files unauthored) | ❌ |
| 2.22 | NotificationsBell | ≥ 18 | None | ❌ |
| 2.23 | Topbar | ≥ 22 | None | ❌ |
| 2.24 | JobActions | ≥ 28 | None | ❌ |
| 2.25 | AddJobDialog, StatusColumn, PropertiesPane, AgentChat, AppSidebar | ≥ 60 | None | ❌ |
| 2.26 | BackendUnreachableOverlay, OfflineIndicator, ErrorBoundary, ConnectionBanner, ThemeToggle | ≥ 30 | `ConnectionBanner.component.test.ts` only | ❌ **4 of 5 missing** |
| 2.27 | ConfirmGate, Stepper, EmptyState, CheckMark, TaskIndicator | ≥ 20 | All 4 primitives ✓ (Stepper, EmptyState, CheckMark, TaskIndicator); + `JobStageBadge.component.test.ts` | ✅ |
| 2.28 | `electron/src/` main process | ≥ 18 | TBD — need to inspect | ⏳ |
| 2.29 | Phase 2 final verification | All green, ≥ 720 cases | 1636 cases TOTAL but Phase 2 surface partially covered | ⚠️ |

**Phase 2: ~15 of 29 tasks ✅, ~14 with significant gaps.**

The 1636 cases come from a mix of the planned per-module tests + the dense/property tests + integration tests. The plan's per-module breakdown is NOT all present.

## Phase 3 — iOS XCTest (Tasks 3.1 – 3.13)

| Task | Plan | Reality | Status |
|---|---|---|---|
| 3.1 | Pin Swift toolchain (5.10) + Ruby 3.3 + iOS deploy target 15.0 | `.mise.toml` has ruby 3.3.5; Swift not in mise registry on macOS so Xcode-managed | ⚠️ partial |
| 3.2 | Extend `add-xcode-targets.rb` to create AppTests / AppUITests / WidgetTests / WatchTests | All 4 target dirs + smoke files + 4 schemes exist | ✅ |
| 3.3 | AppTests — Brand + ErrorReporter | `BrandTests.swift`, `ErrorReporterTests.swift` ✓ | ✅ |
| 3.4 | AppTests — KeychainStore + BiometricAuth | `KeychainStoreTests.swift`, `BiometricAuthTests.swift` ✓ | ✅ |
| 3.5 | AppTests — NetworkMonitor + Bonjour + BackgroundFetcher | `NetworkMonitorTests.swift` ✓; Bonjour + BackgroundFetcher MISSING | ❌ partial |
| 3.6 | AppTests — Spotlight + WatchSessionBridge + CareerOpsNativePlugin | `SpotlightIndexerTests.swift` ✓; WatchSessionBridge + CareerOpsNativePlugin MISSING | ❌ partial |
| 3.7 | Fastlane `test` + `test_ci` lanes | Present | ✅ |
| 3.8 | AppUITests — cold launch + login | Only smoke file | ❌ |
| 3.9 | AppUITests — drawer + bell + deep-links | Only smoke | ❌ |
| 3.10 | WidgetTests — auth gate + 4 widgets + snapshot | Only smoke | ❌ |
| 3.11 | WatchTests — model + RootView | Only smoke | ❌ |
| 3.12 | SwiftLint + SwiftFormat | swiftlint + swiftformat in `.mise.toml`; CI lints with `--strict` | ✅ |
| 3.13 | Phase 3 e2e | `bundle exec fastlane test_ci` un-run (no Xcode locally) | ⚠️ |

**Phase 3: 4 ✅, 6 partial/missing, 3 ⚠️ pending Xcode runner.**

## Phase 4 — CI matrix + Codecov (Tasks 4.1 – 4.5)

| Task | Plan | Reality | Status |
|---|---|---|---|
| 4.1 | Rewrite `.github/workflows/test.yml` matrix | 4 jobs: ts, ios, format, audit, coverage. Codecov v5 wired | ✅ |
| 4.2 | Branch protection update | Doc-only step; user-side action | ⚠️ user task |
| 4.3 | Cache pre-warming | pnpm store, turbo, Xcode DerivedData, SPM, Playwright all cached | ✅ |
| 4.4 | Update `native-release.yml` to macos-15 | TBD — need to check | ⏳ |
| 4.5 | Phase 4 e2e | actionlint clean | ✅ |

## Phase 5 — Verifier rewrites (Tasks 5.1 – 5.11)

| Task | Plan | Reality | Status |
|---|---|---|---|
| 5.1 | `verify-versions.mjs` → versions.integration.test.ts | Present | ✅ |
| 5.2 | `verify-pipeline.mjs` → pipeline.integration.test.ts | Present + in-process job rewrite | ✅ |
| 5.3 | `verify-deep-links.mjs` → deep-links.integration.test.ts | Present | ✅ |
| 5.4 | `verify-backup.mjs` → backup.integration.test.ts | Present | ✅ |
| 5.5 | `verify-post-apply.mjs` → post-apply.integration.test.ts | Present | ✅ |
| 5.6 | `verify-cleanup.mjs` → cleanup.integration.test.ts | Present | ✅ |
| 5.7 | `verify-capacitor.mjs` → capacitor.integration.test.ts (split into 4) | Single file present (not split, but covers brand-consistency) | ⚠️ |
| 5.8 | `verify-multi-user.mjs` → multi-user.integration.test.ts | Present (structural checks only — no spawn-a-server route) | ⚠️ |
| 5.9 | `verify-apply.mjs` → apply.integration.test.ts (split into 5) | Single file (not split) | ⚠️ |
| 5.10 | `test-all.mjs` → `pnpm test` | `test:integration` script not added explicitly but `pnpm test` covers it via vitest workspace projects | ✅ |
| 5.11 | Phase 5 e2e parity | Verifier .mjs files DELETED in Phase 6 commit (85ac8ae); parity oracle gone but structural assertions remain | ⚠️ |

**Phase 5: 7 ✅, 4 ⚠️ (single file vs split, parity oracle deleted).**

## Phase 6 — Documentation + cleanup (Tasks 6.1 – 6.6)

| Task | Plan | Reality | Status |
|---|---|---|---|
| 6.1 | `docs/testing.md` | Present | ✅ |
| 6.2 | `docs/coverage.md` | TBD | ⏳ |
| 6.3 | Update CLAUDE.md / AGENTS.md remove verifier refs | Done — no verify-*.mjs refs outside docs/CHANGELOG | ✅ |
| 6.4 | Update README.md + CONTRIBUTING.md | CONTRIBUTING done; README TBD | ⏳ |
| 6.5 | Delete verifier scripts | All 10 deleted (commit 85ac8ae) | ✅ |
| 6.6 | Phase 6 e2e | Verifier refs zero outside historical docs | ✅ |

## Phase 7 — Verification loop (Tasks 7.1 – 7.4)

The plan says "Loop until 2 consecutive stable passes." `docs/phase7-verification.md` exists but documents a single pass, not 2 consecutive stable ones with `coverage/phase7-passN.json`.

| Task | Plan | Reality | Status |
|---|---|---|---|
| 7.1 | Pass 1 code re-verification matrix | Recorded once | ⚠️ |
| 7.2 | Pass 2 behavioural matrix | Recorded once | ⚠️ |
| 7.3 | Cross-cutting checks | svelte-check / biome / prettier / actionlint all green | ✅ |
| 7.4 | Loop until 2 consecutive stable passes | Only one pass recorded | ❌ |

## Phase 8 — Expand to 1500+ cases (Tasks 8.1 – 8.5)

| Task | Plan | Reality | Status |
|---|---|---|---|
| 8.1 | Inventory case count | 1636 cases | ✅ |
| 8.2 | Gap report against 80% line / 70% branch | Not produced | ❌ |
| 8.3 | Author additional cases to reach 1500+ | 1636 ≥ 1500 ✅ but density was skewed toward existing tests | ⚠️ |
| 8.4 | iOS densification | Not done (no Xcode locally) | ⏳ |
| 8.5 | Final case count | 1636 (TS) — iOS pending | ⚠️ |

## Phase 9 — Final verification loop (Tasks 9.1 – 9.3)

| Task | Plan | Reality | Status |
|---|---|---|---|
| 9.1 | Re-run Phase 7 verification (2 stable passes) | One pass only | ❌ |
| 9.2 | Commit conventional-commit chain | Multiple feature/test/chore commits landed | ✅ |
| 9.3 | Cold-clone install + test under 25 min | Untested | ⏳ |

## Bugs found during this audit (already fixed in commit `c0d6aec`)

1. **`data/auth.db` + `data/app.db` pollution** — tests wrote to the real production DBs at module-load. Fresh-clone first-user-becomes-owner broken. Fixed via `CAREER_OPS_DATA_DIR` env-var override + auto-tmpdir routing when `VITEST=true`. The polluted files on disk (5 ghost users) need manual wipe: `rm data/auth.db* data/app.db*`.

2. **`.agents` ↔ `.claude` skill symlink** — already correct, regression test added.

## Roadmap (priority order)

### P0 — Bugs that would break a fresh user (DONE)
- ✅ DB pollution
- ✅ Skill symlink

### P1 — Server module gaps from Phase 2.15-2.17 (HIGH SIGNAL)
These modules drive critical paths and have ZERO test coverage today:
- `auth.ts` (signup, first-user-becomes-owner hook, role gates)
- `profiles.ts` (multi-profile system)
- `job-resolver.ts` (job ID parsing)
- `apply-dispatcher.ts` (apply pipeline core)
- `quality-checks.ts`
- `orchestrator.ts`
- `portals.ts`
- `scan-history.ts`
- `ui-prefs.ts`
- `projects.ts`
- `interview-schedule.ts`
- `followup-cadence.ts`
- `cv-pdf.ts`
- `linkedin-audit.ts`
- `email-reactor.ts`
- `comp-benchmark.ts`

### P2 — Hooks + API endpoint coverage (Phase 2.18-2.20)
- `hooks.server.ts` (CORS, populateAuth, security headers, withUserContext, error handler)
- Every endpoint under `routes/api/**`

### P3 — Component tests (Phase 2.21-2.27)
- ResponsiveAction* primitives (4 files)
- NotificationsBell, Topbar, JobActions
- AddJobDialog, StatusColumn, PropertiesPane, AgentChat, AppSidebar
- BackendUnreachableOverlay, OfflineIndicator, ErrorBoundary, ThemeToggle

### P4 — iOS test bundles (Phase 3.5-3.11)
- Bonjour + BackgroundFetcher + WatchSessionBridge + CareerOpsNativePlugin
- Cold launch + login + drawer + bell + deep-links UI tests
- Widget snapshot baselines (need a Mac with Xcode 16)

### P5 — Verification loop discipline (Phase 7 + 9)
- Two consecutive stable passes of every code + behavioural verification

### P6 — Cold-clone smoke (Phase 9.3)
- Fresh git clone → mise install → pnpm install → pnpm test < 25min
