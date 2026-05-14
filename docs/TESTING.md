# Testing

career-ops uses Vitest (TS/Svelte) + XCTest (iOS) with Codecov-tracked
coverage. The single entry point is `pnpm test` — everything below it
is implementation detail.

## Quick reference

| Command | What it runs |
|---|---|
| `pnpm test` | Full Vitest matrix across all 5 ui projects + electron |
| `pnpm test:coverage` | Same, with V8 coverage + hard 70%/65% gate |
| `pnpm test:watch` | Interactive watch mode |
| `pnpm test:ui` | Vitest's HTML reporter on http://localhost:51204 |
| `pnpm test:ios` | Fastlane `test` lane — full multi-sim XCTest run |
| `pnpm test:ios:ci` | Fastlane `test_ci` lane — single sim + Codecov-friendly |

## Project layout (Vitest workspace)

`ui/vitest.workspace.ts` declares 5 projects. Each picks files by glob
and runs in the right environment:

| Project | Environment | Globs | Notes |
|---|---|---|---|
| `ui-unit` | jsdom | `src/lib/**/*.test.ts` (excl server/components) | Fast pure-logic + state-store tests |
| `ui-server` | node | `src/lib/server/**/*.test.ts`, `src/routes/api/**/*.test.ts`, `src/hooks.server.test.ts` | Server modules + endpoints (no jsdom) |
| `ui-component` | browser (Playwright — Chromium + WebKit, headless by default) | `src/**/*.component.test.ts`, `src/**/*.svelte.test.ts` | Real DOM for responsive-matchMedia behaviour |
| `ui-routes` | jsdom | `src/routes/**/*.test.ts` excl `api/*` | Page-level smoke |
| `ui-integration` | node | `src/lib/integration/**/*.integration.test.ts` | Structural assertions across repo files (apply / backup / capacitor / cleanup / deep-links / multi-user / pipeline / post-apply / versions) |

Naming convention:

```
foo.ts                 → foo.test.ts            (ui-unit OR ui-server)
foo.svelte             → foo.component.test.ts  (ui-component, browser)
foo-verifier.ts        → foo.integration.test.ts (ui-integration)
```

## Adding a test

### Unit test (pure logic)

```ts
// ui/src/lib/foo.test.ts
import { describe, expect, it } from 'vitest';
import { foo } from './foo';

describe('foo', () => {
  it('does the thing', () => {
    expect(foo(1)).toBe(2);
  });
});
```

### Server / endpoint test

```ts
// ui/src/lib/server/bar.test.ts
import { vi } from 'vitest';
// Mock DB / FS deps BEFORE importing the module under test.
vi.mock('./db', () => ({ db: { /* mock */ } }));

const { bar } = await import('./bar');

describe('bar', () => {
  it('handles input', () => {
    expect(bar('x')).toEqual({ ok: true });
  });
});
```

### Component test (browser mode)

```ts
// ui/src/lib/components/Foo.component.test.ts
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { page } from '@vitest/browser/context';
import Foo from './Foo.svelte';

describe('Foo', () => {
  it('renders + clicks', async () => {
    const { container } = render(Foo, { props: { value: 1 } });
    const btn = container.querySelector('button')!;
    const user = userEvent.setup();
    await user.click(btn);
    expect(btn.textContent).toBe('clicked');
  });
});
```

To test responsive behaviour (mobile vs desktop), use the page viewport:

```ts
await page.viewport(390, 844);  // iPhone 17 Pro
// ...assert mobile rendering
await page.viewport(1280, 800);
// ...assert desktop rendering
```

## Coverage

`vitest.config.ts` enforces the global gate:

```ts
coverage: {
  thresholds: {
    lines: 70,
    branches: 65,
    functions: 70,
    statements: 70,
    perFile: true, // no file can drag the average up while sitting at 0%
  },
}
```

Excluded paths (auto-generated, types-only, test infra):

- `src/lib/components/ui/**` (bits-ui wrappers)
- `src/**/*.config.*`
- `src/**/types.ts`, `src/**/*.d.ts`
- `src/test-setup.ts`, `src/test-helpers/**`
- `src/**/*.test.ts`, `src/**/*.component.test.ts`

iOS coverage (xcov) uses `.xcovignore` at repo root — same idea: generated
Brand.swift, ErrorReporter shims, CapApp-SPM bridge, SPM checkouts, and
Smoke.swift placeholders don't count.

Run coverage locally:

```bash
pnpm test:coverage           # writes ui/coverage/{lcov.info,html/}
pnpm test:ios:ci             # writes ui/ios/App/fastlane/coverage/cobertura.xml
```

CI uploads both to Codecov with flags `ts` + `ios`. PR comments show
combined + per-flag deltas.

## MSW (HTTP mocking)

`test-helpers/msw-handlers.ts` carries base handlers for every common
endpoint. Override per-test:

```ts
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());

it('handles 401', async () => {
  server.use(http.get('*/api/foo', () => HttpResponse.json({}, { status: 401 })));
  // ...
});
```

## State-store hygiene

Module-level `$state` stores leak between tests in the same file
because Svelte 5's module graph is shared. The `test-helpers/state-helpers.ts`
exports `resetAll()` + per-store resetters. `render()` from
`test-helpers/render.ts` calls `resetAll()` automatically.

For non-component tests that import a singleton store, call the
specific reset:

```ts
import { resetNotificationsStore } from '$lib/test-helpers/state-helpers';

beforeEach(async () => {
  await resetNotificationsStore();
});
```

## iOS tests

Test bundles live under `ui/ios/App/`:

| Target | Type | Host | Min iOS |
|---|---|---|---|
| `AppTests` | unit-test | App | 15.0 |
| `AppUITests` | ui-testing | App | 15.0 |
| `WidgetTests` | unit-test | CareerOpsWidget | 16.0 |
| `WatchTests` | unit-test | CareerOpsWatch | 15.0 (watchOS) |

Re-run `ruby scripts/native/add-xcode-targets.rb` (from `ui/ios/App/`) to
recreate any test target you delete. The script is idempotent.

Add a Swift test:

```swift
// ui/ios/App/AppTests/MyTests.swift
import XCTest
@testable import App

final class MyTests: XCTestCase {
  func testBrandConstants() {
    XCTAssertEqual(Brand.urlScheme, "careerops")
  }
}
```

Snapshot tests use [`swift-snapshot-testing`](https://github.com/pointfreeco/swift-snapshot-testing)
+ [`ViewInspector`](https://github.com/nalexn/ViewInspector). Re-record
baselines:

```bash
RECORD=1 bundle exec fastlane test_ci
```

PR description MUST flag snapshot-update commits.

## Pre-push gate

Lefthook's `pre-push` runs `pnpm exec turbo run test` across ui +
electron. iOS tests are NOT in pre-push (sim bootstrap dwarfs turbo's
speedup). Bypass for emergencies: `SKIP_LEFTHOOK=1 git push`.

## CI architecture

`.github/workflows/test.yml` splits into three parallel jobs:

- `ts` (ubuntu-latest, ~8 min) — typecheck + Vitest matrix + Codecov `ts` flag
- `ios` (macos-15, ~25 min) — Fastlane `test_ci` + Codecov `ios` flag
- `audit` (ubuntu-latest, ~30s) — `pnpm audit --audit-level moderate`

`coverage` (downstream) summarises the two flagged Codecov uploads. The
Codecov action handles PR comments per-flag.

`ios` job runs Fastlane `test_ci`, which spawns `xcodebuild test` over
the 4 test targets (`AppTests`, `AppUITests`, `WidgetTests`, `WatchTests`)
on the macos-15 runner with Xcode 16. xcov produces a Cobertura report
consumed by the `ios`-flagged Codecov upload step.

## Troubleshooting

**"Context Menu.Content not found"** — bits-ui Menu context error.
Usually means a parent rendered Sheet but a child rendered
DropdownMenu.Item (or vice versa). Use the `useIsMobile()` hook from
`$lib/hooks/use-is-mobile.svelte` (it's a singleton — see file's
header for the history).

**Tests pass locally but fail in CI** — check the Playwright browser
cache key. If `pnpm-lock.yaml` changed, the cache invalidates and
Chromium is re-downloaded (90 sec cold). Watch `Cache Playwright
browsers` in the workflow log for a hit/miss.

**Coverage tanks unexpectedly** — `pnpm test:coverage` then open
`ui/coverage/html/index.html`. The per-file table shows what dropped.

**MSW "unhandled request"** — `setupServer({ onUnhandledRequest:
'error' })` forces every fetch to have a matching handler. Add one to
your test or to `msw-handlers.ts`.
