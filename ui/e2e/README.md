# E2E tests (Playwright)

HP5 -- top-down user-flow smoke tests against `pnpm --filter ui preview`
(prod build). Complement the per-component Vitest browser-mode suite.

## Why a separate suite

The existing `ui-component` Vitest project runs Playwright at the
component level -- wraps a single Svelte component, drives it with
keyboard/mouse, asserts DOM. The E2E tests here are higher up: they
boot the whole SvelteKit app and exercise multi-page user journeys
(signin → create profile → paste JD → evaluate). They're slower
but catch regressions that component tests miss (routing,
hooks.server auth, real DB interactions).

## Running locally

```sh
# Build the prod bundle + boot preview server + run E2E tests
pnpm --filter ui test:e2e

# Or, with the preview server already running:
pnpm --filter ui exec playwright test e2e/

# Update screenshots / videos:
pnpm --filter ui exec playwright test e2e/ --update-snapshots

# Interactive UI:
pnpm --filter ui exec playwright test e2e/ --ui
```

## CI

Runs in the `Tests / ts` job after `pnpm build`. Set the `CI=1` env
to disable headed mode + trace-on-failure recording.

## Writing new tests

Group by user-journey, not by feature:

- `e2e/auth/` -- sign-in, sign-up, sign-out
- `e2e/onboarding/` -- first-run wizard
- `e2e/inbox/` -- pipeline browsing, status flips
- `e2e/evaluation/` -- paste-a-JD → A-F report
- `e2e/multi-user/` -- user A vs user B isolation

Each spec gets a fresh ephemeral DB seeded via
`e2e/_helpers/seed.ts`. The seed file is the same shape `pnpm doctor`
uses to verify the install.

Snapshot tests live under `e2e/__screenshots__/`. Commit the
deterministic snapshots; flag flaky ones with `.skip()` until the
underlying source is stabilized.
