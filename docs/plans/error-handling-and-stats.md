# career-ops/ui Phase 1 — Error Handling + Stats Redesign

> **For Claude:** Use superpowers:executing-plans to implement this plan task-by-task.

**Date**: 2026-05-07
**Package**: `@/career-ops/ui` (`ui/src/`)
**Goal**: Add comprehensive error handling/surfacing across server + client and replace the bare-numbers Stats page with a proper analytics dashboard.
**Architecture**: Centralized error envelope (`{ ok: true, ... }` / `{ ok: false, error: { message, code?, details? } }`). All endpoints wrapped via shared helper. Client `apiCall<T>` parses envelope and dispatches a `career-ops:open-notifications` event for "Details" toast actions. Stats charts are pure SVG/div (no chart library).

User: cole.bieker@icloud.com — explicit "yes to everything" on the proposed changelog 2026-05-07.

Each task is atomic: implement → verify → next.

---

## Status Legend

- `[ ]` — Not started
- `[x]` — Done (implemented + verified)
- `[~]` — In progress

---

## Baseline (before any changes)

| Metric | Value |
|--------|-------|
| Tests | 0 (no test runner configured for ui workspace) |
| Type-check | Passes |
| Stats cards (current) | 4 hero cards + by-status grid + 4-bucket score dist |
| Endpoints with try/catch | 1 / 6 (`agent-chat` only) |
| Client error envelope | unstructured (string `data.error` or HTTP statusText) |

---

## TASK 1 — server-error-helpers

**Status**: [ ]

**Gap**: Endpoints either return ad-hoc shapes (`{ ok: true }` / `{ error: msg }`) or 500 with no logging. No central place to wrap a handler with try/catch + envelope + event-bus logging.

**Plan**:
- Create `lib/server/api-helpers.ts` exporting:
  - `okJson<T>(data)` — returns `{ ok: true, ...data }`.
  - `errJson(message, { status?, code?, details? })` — returns `{ ok: false, error: { ... } }`.
  - `wrap(source, handler)` — try/catch wrapper that auto-envelopes return value and logs errors to bus.
  - `badRequest(message, details?)` — throws an HttpError-shaped object that `wrap()` converts to a 400.
- Update `hooks.server.ts` `handleError` to also surface `code` + `details` on the returned object.

**Files**:
- Create: `ui/src/lib/server/api-helpers.ts`
- Edit: `ui/src/hooks.server.ts`

**Verification**: `pnpm svelte-check` passes; importing `wrap` and using it in a sample endpoint returns the expected envelope.

---

## TASK 2 — wrap-existing-endpoints

**Status**: [ ]

**Gap**: `run`, `status`, `settings`, `notifications`, `stream`, `agent-chat` lack consistent error envelopes and most lack try/catch.

**Plan**:
- Wrap `routes/api/run/+server.ts` — try/catch around `runScan/runGemini/runLinkedInApply/runLinkedInLogin` calls.
- Wrap `routes/api/status/+server.ts` — try/catch around fs read/write.
- Wrap `routes/api/settings/+server.ts` — try/catch around `writeEnv`.
- Wrap `routes/api/notifications/+server.ts` — minimal, defensive.
- Wrap `routes/api/stream/+server.ts` — guard controller.enqueue calls.
- Migrate `routes/api/agent-chat/+server.ts` to the new envelope shape.

**Files**:
- Edit: `ui/src/routes/api/run/+server.ts`
- Edit: `ui/src/routes/api/status/+server.ts`
- Edit: `ui/src/routes/api/settings/+server.ts`
- Edit: `ui/src/routes/api/notifications/+server.ts`
- Edit: `ui/src/routes/api/stream/+server.ts`
- Edit: `ui/src/routes/api/agent-chat/+server.ts`

**Verification**: `curl localhost:5173/api/run -X POST -d '{"task":"unknown"}'` returns `{"ok":false,"error":{"message":"unknown task","code":"BAD_REQUEST"}}` with HTTP 400, and an event appears in `/api/notifications`.

---

## TASK 3 — client-api-error-handling

**Status**: [ ]

**Gap**: Client `apiCall` only reads `data.error` as a string. Toast disappears in 4s with no way to drill into the error.

**Plan**:
- Update `lib/api.ts`:
  - Parse `error.message`, `error.code`, `error.details` from envelope.
  - Export `ApiError` class with `status`, `code`, `details`, `data`.
  - Network errors get `status: 0`, `code: 'NETWORK'`.
  - Error toast lasts 10s and shows a "Details" action that dispatches `career-ops:open-notifications`.
  - New `inlineError` opt to suppress toast when caller wants inline UI.
- Update `lib/notifications.svelte.ts`:
  - Add `runningTasks` state polled from `/api/run` every 3s.
  - Add reconnection backoff for SSE drops (1s, 2s, 4s, 8s, 16s, 30s cap).
  - Listen for `career-ops:open-notifications` to expose a method that NotificationsBell can subscribe to.

**Files**:
- Edit: `ui/src/lib/api.ts`
- Edit: `ui/src/lib/notifications.svelte.ts`

**Verification**: A 500 from `/api/run` triggers a 10s toast with Details action; NotificationsBell opens when the action fires; runningTasks reflects `/api/run` polling output.

---

## TASK 4 — client-error-components

**Status**: [ ]

**Gap**: No sectional error fallback (full-page +error.svelte only). No connection banner. No surface for running tasks in topbar.

**Plan**:
- Create `lib/components/ErrorBoundary.svelte` — `<svelte:boundary>`-based, accepts `title`/`onretry`.
- Create `lib/components/ConnectionBanner.svelte` — reads `notifications.connected`, shows "Reconnecting…" pill when state is `error`.
- Update `lib/components/NotificationsBell.svelte` — listen to `career-ops:open-notifications` and open the dropdown.
- Update `lib/components/Topbar.svelte` — embed `ConnectionBanner` and a `TaskIndicator` showing `notifications.runningTasks` (green pulse).

**Files**:
- Create: `ui/src/lib/components/ErrorBoundary.svelte`
- Create: `ui/src/lib/components/ConnectionBanner.svelte`
- Edit: `ui/src/lib/components/NotificationsBell.svelte`
- Edit: `ui/src/lib/components/Topbar.svelte`

**Verification**: Killing the dev server from another terminal shows the reconnect banner; running `runScan` shows a green pulse with "scan" in the topbar.

---

## TASK 5 — health-endpoint

**Status**: [ ]

**Gap**: No way for the UI to ask "is everything healthy?" — needs an aggregate endpoint.

**Plan**:
- Create `routes/api/health/+server.ts` returning:
  - `pipeline.exists`, `pipeline.size`, `pipeline.mtime`
  - `reports.count`
  - `gemini.scoresExists`, `gemini.keyConfigured`
  - `anthropic.keyConfigured`
  - `runningTasks` (proxy of `/api/run`)
  - `lastScanAt` (mtime of pipeline.md)
- Wrap with `wrap('health', ...)`.

**Files**:
- Create: `ui/src/routes/api/health/+server.ts`

**Verification**: `curl localhost:5173/api/health` returns the documented shape.

---

## TASK 6 — chart-primitives

**Status**: [ ]

**Gap**: No reusable charts. The current Stats page is bare numbers.

**Plan**:
- Create `lib/components/charts/Sparkline.svelte` — small inline trend line via SVG path.
- Create `lib/components/charts/Funnel.svelte` — horizontal bars with stage labels + drop-off % between stages.
- Create `lib/components/charts/Histogram.svelte` — vertical bars for score distribution; accepts color-coded buckets and optional stacked sub-buckets.
- Create `lib/components/charts/StackedBar.svelte` — horizontal stacked bar for proportional breakdowns (BG risk).

**Files**:
- Create: `ui/src/lib/components/charts/Sparkline.svelte`
- Create: `ui/src/lib/components/charts/Funnel.svelte`
- Create: `ui/src/lib/components/charts/Histogram.svelte`
- Create: `ui/src/lib/components/charts/StackedBar.svelte`

**Verification**: Each chart renders correctly with sample data when used on the Stats page in TASK 7.

---

## TASK 7 — stats-redesign

**Status**: [ ]

**Gap**: Stats UX is "garbage and not informative" per user. Bare card grid with no charts/trends.

**Plan**:
- Update `routes/stats/+page.server.ts` to compute:
  - Hero metrics (pipeline total, applied, reports, average score).
  - Funnel counts per Status.
  - Score distribution buckets (0-1 / 1-2 / 2-3 / 3-4 / 4-5), each split into applied vs not.
  - Top 10 companies with status breakdown.
  - Top 5 sources by URL hostname → friendly name.
  - Velocity: applications/day for the last 14 days (parsed from applications.md Date column), this-week vs last-week totals.
  - BG-risk distribution (LOW/MEDIUM/HIGH/BLOCKED counts).
  - Top 5 ready jobs preview (highest score in `Ready` status).
- Update `routes/stats/+page.svelte`:
  - Hero row with sparklines and trend deltas where available.
  - Funnel chart (full-width).
  - Score distribution histogram + BG-risk stacked bar (side-by-side).
  - Top companies + Top sources lists (side-by-side).
  - Velocity panel.
  - Top 5 ready jobs with Apply CTA.
  - "Run scan" / "Run Gemini" CTAs surfaced when pipeline stale (mtime > 7 days).

**Files**:
- Edit: `ui/src/routes/stats/+page.server.ts`
- Edit: `ui/src/routes/stats/+page.svelte`

**Verification**: Visit `/stats` — page renders all sections with real data from current pipeline; running `runScan` updates the staleness CTA.

---

## TASK 8 — Register Rules + Config

**Status**: [ ]

**Plan**:
- Verify `lib/server/api-helpers.ts` is imported by all updated endpoints.
- Verify `notifications.svelte.ts` exports `runningTasks` and `connected` for component consumption.
- Verify ChartPrimitives exported (just relative imports, no barrel needed).
- Confirm `ConnectionBanner` and `TaskIndicator` are mounted inside `Topbar.svelte`.
- Register all task command names (scan, gemini, apply-linkedin, apply-linkedin-login) in `routes/api/run/+server.ts` switch — confirm no orphaned task functions in orchestrator.

**Files**:
- Edit (verify-only): `ui/src/lib/components/Topbar.svelte`, `ui/src/routes/stats/+page.svelte`

**Verification**: `grep -r "from '\$lib/server/api-helpers'" ui/src/routes/api/` matches all 6 endpoints; `grep "ConnectionBanner" ui/src/lib/components/Topbar.svelte` returns a hit.

---

## TASK 9 — Integration Verification

**Status**: [ ]

**Plan**:
- Verify command registration: every task name registered via the `/api/run` POST switch (`registerCommand` equivalent — task→handler dispatch). Task strings `scan`, `gemini`, `apply-linkedin`, `apply-linkedin-login` are the registered command IDs; each must dispatch to a function in `orchestrator.ts`. Run `grep "case '" ui/src/routes/api/run/+server.ts` to count registered command cases and ensure it matches the orchestrator export count.
- Verify config settings read: `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` are read (`config.get` equivalent: `process.env.X` after `loadEnv()`) by `/api/health` and `runGemini`. `grep "process.env.GEMINI_API_KEY\|process.env.ANTHROPIC_API_KEY" ui/src/` should return ≥ 2 hits across orchestrator, ai.ts, and the new health endpoint.
- Verify class instantiation: `notifications` (NotificationStore class) is instantiated at module level in `lib/notifications.svelte.ts`, and `init()` is called in `+layout.svelte` (or root `+page.svelte`). Bus class is also instantiated in `lib/server/events.ts`. Confirm feature wired by grepping for the instantiated singletons.
- Verify dead code / unused export: every export from `api-helpers.ts` is imported by at least one consumer; orphan check via `grep -r "okJson\|errJson\|wrap\b\|badRequest" ui/src/routes/api/`.
- Grep audit:
  - `grep -c "wrap(" ui/src/routes/api/**/+server.ts` ≥ 6 (one per wrapped endpoint).
  - `grep -c "ApiError" ui/src/lib/` ≥ 1 export + ≥ 0 uses.
  - `grep "import.*Funnel\|Histogram\|Sparkline\|StackedBar" ui/src/routes/stats/+page.svelte` shows all 4 charts wired.
- Fix any gaps found before proceeding.

**Verification**:
- `grep "case '" ui/src/routes/api/run/+server.ts` returns 4 lines, matching 4 registered commands and 4 orchestrator exports.
- `grep "process.env.GEMINI_API_KEY\|process.env.ANTHROPIC_API_KEY" ui/src/routes/api/health/+server.ts` returns hits (config setting read).
- `grep "notifications.init" ui/src/routes/+layout.svelte` returns a hit (NotificationStore instantiated and wired).
- `grep -c 'wrap(' ui/src/routes/api/**/+server.ts` = 6 (no orphan exports from api-helpers).
- All 4 chart components imported into stats page (no dead code).

---

## TASK 10 — Full QA + Coverage

**Status**: [ ]

**Plan**:
- Run: `cd ui && pnpm svelte-check` (project's lint surrogate)
- Run: `cd ui && pnpm build` (smoke test for prod build)
- Manually verify in browser that the new error toasts, banner, task indicator, and stats page all render.
- (No `pnpm -w run qa:lint` workspace target exists at career-ops; ui workspace uses svelte-check + tsc only.)

**Verification**: All commands exit 0. (Note: career-ops/ui is a standalone workspace; the resist-js `pnpm -w run qa:lint` and `pnpm qa:test` targets do not apply here. svelte-check is the local equivalent.)

---

## TASK 11 — Final Verification + Commit

**Status**: [ ]

**Plan**:
- Verify all 8 new files exist (api-helpers, health endpoint, ErrorBoundary, ConnectionBanner, 4 charts).
- Verify all 14 modified files were touched (hooks.server, api.ts, notifications, Topbar, NotificationsBell, 6 endpoints, 2 stats files).
- Verify integration audit (TASK 9) shows zero gaps.
- Verify `pnpm svelte-check` exits 0.
- Commit with message describing both the error-handling overhaul and the stats redesign.

**Verification**:
- All 8 new `.ts`/`.svelte` files exist
- All 14 modified files contain expected new symbols (`wrap`, `okJson`, `runningTasks`, charts)
- Integration audit (TASK 9) shows zero gaps
- `pnpm svelte-check` exits 0
- Commit recorded in git log

---

## Execution Order

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | server-error-helpers | -- |
| 2 | wrap-existing-endpoints | 1 |
| 3 | client-api-error-handling | 1 |
| 4 | client-error-components | 3 |
| 5 | health-endpoint | 1 |
| 6 | chart-primitives | -- |
| 7 | stats-redesign | 5, 6 |
| 8 | Register rules + config | 1-7 |
| 9 | Integration verification | 8 |
| 10 | Full QA + Coverage | 9 |
| 11 | Final verification + commit | 10 |
