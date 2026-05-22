# Coverage policy

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

Heron gates every PR on test coverage. This page documents the policy: what counts toward the gate, what's excluded, and why.

## Targets

| Surface | Gate (lines) | Gate (branches) | Gate (functions) | Per-file floor |
|---|---|---|---|---|
| TypeScript (`ui/src/**`, `scripts/**`) | 70% (rising to 90% post-Phase 8) | 62% | 67% | 50% |
| Electron desktop (`ui/electron/src/**`) | **95%** | **85%** | **100%** | **80%** |
| iOS (`ui/ios/App/App` + extensions + Watch) | **95%** | n/a | n/a | n/a |
| Android (`ui/android/app/src/main/**`) | 95% | 85% | 100% | 80% |

The TS, Electron, iOS, and Android numbers are uploaded as separate Codecov flags (`ts` / `electron` / `ios` / `android`). The combined project gate (`codecov.yml::coverage.status.project`) is auto-target with 1% drift tolerance.

## What "95% on authored code" means

Strict 100% coverage is mathematically impossible without including generated files. Heron's policy: **gate ≥95% on hand-authored code**, with three documented exclusion classes.

### Class 1 -- Generated / scaffolded files

These regenerate on every brand re-apply or `cap sync`. Hand-editing them is forbidden; testing them is anti-pattern (the test would drift on every regen).

| File | Generator | Class |
|---|---|---|
| `ui/electron/src/brand.ts` | `pnpm brand:apply` | excluded |
| `ui/electron/src/rt/electron-rt.ts` | Capacitor scaffold (`cap sync electron`) | excluded |
| `ui/electron/src/rt/electron-plugins.js` | Capacitor scaffold | excluded |
| `ui/electron/src/setup.ts` | Capacitor scaffold | excluded |
| `ui/electron/src/preload.ts` | Capacitor scaffold (small hand-edit allowed) | excluded |
| `ui/electron/capacitor.config.ts` | declarative config | excluded |
| `ui/electron/live-runner.js` | dev-only launcher | excluded |
| `ui/ios/App/*/Brand.swift` (5 copies) | `pnpm brand:apply` | excluded (canonical version validated by `BrandTests.swift`) |
| `ui/ios/App/Extensions/*/ErrorReporter.swift` (copies) | apply-brand symlink-like copy | excluded (canonical version tested by `ErrorReporterTests.swift`) |

### Class 2 -- Vendored / SPM / node_modules

Already excluded by tool defaults; documented here for completeness:

- `**/node_modules/**`
- `ui/ios/App/SourcePackages/**`
- `ui/ios/App/CapApp-SPM/**`
- `ui/ios/App/DerivedData/**`
- `ui/electron/{build,dist}/**`

### Class 3 -- Imperative bootstrap covered by integration tests

A small amount of code that consumes Electron's runtime API (window creation, menu installation, tray construction, app event listeners) is covered by the **Playwright e2e-electron harness** rather than unit tests. The unit-test surface inside `ui/electron/src/` is fully reachable; the bootstrap orchestration in `index.ts` lines 200-349 is exercised by `e2e-electron/launch.spec.ts`.

If a function CAN be extracted into a pure-logic module and unit-tested, it MUST be. The integration-test exclusion is for code where unit testing requires re-implementing Electron in mocks.

## Why these numbers

- **95% lines** is the practical ceiling above which marginal test value drops (you're testing error paths that can't be triggered, defensive branches against typed-impossible inputs, etc.). The 5% headroom absorbs unreachable defensive `}` braces, type-narrowing assertions, and the like.
- **85% branches** matches Codecov's "well-tested" threshold; <85% means meaningful conditional paths are unverified.
- **100% functions** has no excuse -- every public function should have at least one test.
- **Per-file floor 80%** prevents "averaging out" -- one well-tested file can't paper over an entirely-untested neighbour.

## Snapshot tests (iOS)

Widget + Watch SwiftUI views use [`swift-snapshot-testing`](https://github.com/pointfreeco/swift-snapshot-testing) for visual regression coverage. Baselines live next to the test files under `__Snapshots__/`. To re-record after intentional UI changes:

```sh
cd ui/ios/App
bundle exec fastlane test_ci RECORD=1
```

Then commit the regenerated `__Snapshots__/` files in the same PR as the UI change.

## Codecov flag layout

```yaml
flags:
  ts:
    paths:
      - ui/src/**
      - scripts/**
  electron:
    paths:
      - ui/electron/src/**
  ios:
    paths:
      - ui/ios/App/**
  android:
    paths:
      - ui/android/app/src/main/**
```

Each flag has its own status check that comments on every PR. A PR can fail one flag and pass others; the combined `project` status fails if any flag falls below its target.

## Local workflow

```sh
pnpm test                  # full matrix (Vitest + electron), no coverage
pnpm test:coverage         # same + coverage gate (fails if below threshold)
pnpm test:watch            # interactive
pnpm test:ios              # full multi-simulator (slow)
pnpm test:ios:ci           # single iPhone 16 Pro sim, xcov gate
```

## Pre-push gate

`lefthook.yml` runs `turbo run test:coverage` on `git push`. Bypassing requires `SKIP_LEFTHOOK=1` and is only acceptable for emergency hotfixes -- coverage drift is a top three reason for CI breakage on `main`.
