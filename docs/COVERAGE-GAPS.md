# Coverage gaps -- snapshot

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

Snapshot of authored-code coverage at the start of the 95% push (2026-05-22). This page is replaced on completion of the push -- current `pnpm test:coverage` + `bundle exec fastlane test_ci` outputs are the live source of truth.

## Electron -- `ui/electron/src/**`

Baseline `pnpm --filter heron-electron test:coverage`:

```text
All files         |   96.49 |    86.66 |     100 |   98.11 |
 mdns.ts          |   92.85 |    66.66 |     100 |     100 |
 notifications.ts |   95.45 |    83.33 |     100 |   94.73 |
```

**These numbers are on the INCLUDED SUBSET only.** Critical gap: 712 lines of authored code (`index.ts` 349L + `tray.ts` 330L hand-written internals + 33L of tray HTTP polling) are excluded.

After Phase 2 (this push), the exclusion set shrinks to:

| File | Lines | Excluded? | Reason |
|---|---|---|---|
| `src/index.ts` | ~85 (after extraction) | bootstrap only, covered by e2e-electron | Phase 2.2-2.4 extracts pure logic; remaining bootstrap covered by Playwright launch.spec.ts |
| `src/rt/electron-rt.ts` | 93 | ✓ generated | Capacitor scaffold |
| `src/rt/electron-plugins.js` | 0 (empty stub) | ✓ generated | Capacitor scaffold |
| `src/setup.ts` | 240 | ✓ generated | Capacitor scaffold |
| `src/preload.ts` | 30 | ✓ generated | Capacitor scaffold |
| `src/brand.ts` | 14 | ✓ generated | apply-brand.mjs |
| `capacitor.config.ts` | -- | ✓ generated | declarative |
| `live-runner.js` | -- | ✓ excluded | dev-only |

New files added in Phase 2:

| File | Origin | Tests |
|---|---|---|
| `src/server-process.ts` | extracted from index.ts (findFreePort + probeHealth + waitForServer + startEmbeddedServer) | server-process.test.ts |
| `src/deep-links.ts` | extracted (URL resolution for tray.onOpenPath + window deep-links) | deep-links.test.ts |
| `src/error-routing.ts` | extracted (unhandled + unhandledRejection handlers) | error-routing.test.ts |
| `src/net-polling.ts` | extracted (interval-based net.isOnline polling) | net-polling.test.ts |
| `src/tray-http.ts` | extracted from tray.ts (fetchStats + postEmpty) | tray-http.test.ts |
| `src/tray-menu-builder.ts` | extracted from tray.ts (rebuildMenu body → pure template builder) | tray-menu-builder.test.ts |

Target: **≥95% lines / ≥85% branches / 100% functions / ≥80% per-file** after Phase 2.7.

## iOS -- `ui/ios/App/**`

Baseline `bundle exec fastlane test_ci` (existing gate 60%). Per-target authored LOC:

| Target | Authored LOC | Tested LOC (est.) | Gap |
|---|---|---|---|
| App | ~3,400 | ~2,500 (1,442 LOC of tests covering main paths) | ~900L (long tail in BackgroundFetcher, NativePlugin, SpotlightIndexer error paths) |
| AppWidget | 1,490 | 0 (10L smoke) | **1,490L** -- InboxIssuesWidget, NextInterviewWidget, TopApplyWidget, WidgetAuthGate, WidgetBundle |
| AppLiveActivity | 212 | 0 (no test target) | **212L** -- LiveActivity content state, dismissal policy |
| AppShareExtension | 244 | 0 (no test target) | **244L** -- ShareViewController input parsing, app-group bridge, deep-link emission |
| WatchApp | 669 | 0 (10L smoke) | **669L** -- WatchModel IPC, RootView SwiftUI |

Total authored gap: **~3,515 LOC** to bring to 95%.

### Phase 3 status

**Logic tests written** (804 LOC across 7 new Swift test files):

- `WidgetTests/WidgetAuthGateTests.swift` -- 12 cases for `WidgetAuth.isAuthenticated()`
- `WidgetTests/InboxIssuesWidgetTests.swift` -- 6 cases for `IssueSnapshot` codability + entry shape
- `WidgetTests/NextInterviewWidgetTests.swift` -- 6 cases for `NextInterviewSnapshot` codability
- `WidgetTests/TopApplyWidgetTests.swift` -- 6 cases for `TopApplyCandidate` codability + runner-ups
- `WidgetTests/WidgetBundleTests.swift` -- 4 cases for `WidgetStats` + `WidgetEntry`
- `WatchTests/WatchModelTests.swift` -- 16 cases for `applyPayload` branches, persist/load round-trip
- `WatchTests/WatchAppLifecycleTests.swift` -- 4 cases for singleton + codability

**Deferred to follow-up PR -- iOS test infrastructure work**:

1. **WidgetTests target setup is broken**: `TEST_HOST = $(BUILT_PRODUCTS_DIR)/AppWidget.app/AppWidget`, but AppWidget is an `.appex` (app extension), not a `.app`. xcodebuild rejects this. Fix: refactor the widget code into a static library / framework that both AppWidget and WidgetTests link, OR set TEST_HOST = `App.app` and link the widget extension binary into the test bundle via `OTHER_LDFLAGS`.

2. **WatchTests target produces output conflict**: "Multiple commands produce 'WatchApp.app/PlugIns/.bundle'". Fix: ensure the test bundle's PRODUCT_NAME is unique so it doesn't collide with WatchApp's PlugIns convention.

3. **Fastlane `test_ci` only runs `AppTests` scheme** (`TEST_SCHEME = "AppTests"` in Fastfile). The Widget + Watch + future LiveActivity / ShareExtension test schemes need adding via `run_tests` invocations or a multi-scheme orchestrator.

4. **xcov gate stays at 60% on App.app only**. Bumping requires (1)+(2)+(3) above to land first so the new test bundles actually execute.

5. **SPM deps not added**: `swift-snapshot-testing` + `ViewInspector` deferred. The logic-only tests above don't need them, but pixel-level SwiftUI testing eventually will.

6. **LiveActivity + ShareExtension test targets not created**: both extensions need new test bundles via `scripts/native/add-xcode-targets.rb` extension. Deferred until the existing Widget/Watch targets compile.

Once the infrastructure work lands, the existing Swift tests above auto-contribute coverage. Estimated effort: 6-8 hours of careful Xcode project surgery, best done as an isolated PR.

## Android -- `ui/android/app/src/main/**`

Baseline: zero tests, zero coverage tooling configured.

Phase 4 audit shows authored Kotlin surface is minimal (Capacitor MainActivity + manifest); coverage trivially reaches 95% with a handful of cases.

## TypeScript -- `ui/src/**`, `scripts/**`

Out of scope for this push (already at gate per `ui/vitest.config.ts`). Phase 8 of the broader testing plan (`tidy-zooming-rabbit`) is the path to densify TS to 90%+.

## Tracking

This document is a snapshot. Replace it on completion of Phase 7 (verification loop) with the final per-file coverage numbers.
