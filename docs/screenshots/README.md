# Screenshots

The main `README.md` references PNGs in this directory. They're
captured automatically by
[`.github/workflows/screenshots-refresh.yml`](../../.github/workflows/screenshots-refresh.yml)
on push-to-main + weekly cron, or manually with:

```bash
pnpm screenshots                        # managed: seed + boot + capture + teardown
BASE_URL=http://localhost:5173 pnpm screenshots   # against an existing `pnpm dev`
```

The managed path seeds an isolated SQLite database under `os.tmpdir()`,
builds + boots `vite preview` with `HERON_SCREENSHOT_MODE=1`, and walks
Playwright through the routes below. The double-gated bypass in
`ui/src/lib/server/screenshot-bypass.ts` synthesises a demo user only
when `HERON_DATA_DIR` resolves inside `os.tmpdir()`, so a stray invocation
against a real install fails closed.

The capture script lives at `scripts/system/capture-screenshots.mjs`.
The seed fixtures live at `scripts/system/seed-demo-data.mjs`.

## What gets captured

| File | Route | Viewport | Theme |
|---|---|---|---|
| `inbox-light.png` | `/inbox` | 1440x900 | light |
| `inbox-dark.png` | `/inbox` | 1440x900 | dark |
| `evaluation-light.png` | `/job/{acmeId}` | 1440x900 | light |
| `evaluation-dark.png` | `/job/{acmeId}` | 1440x900 | dark |
| `autopilot.png` | `/autopilot` | 1440x900 | light |
| `patterns.png` | `/patterns` | 1440x900 | light |
| `interview-prep.png` | `/job/{acmeId}/prep` | 1440x900 | light |
| `mobile-inbox.png` | `/inbox` | 393x852 (iPhone 16 Pro) | light |

`{acmeId}` is the deterministic `urlId()` of the seeded Acme posting --
`md5('https://boards.greenhouse.io/acme/jobs/4099991').slice(0, 12)`
= `ae6c9ea0283a`.

## Why these are checked in

Previously they weren't, on the theory that contributors regenerate
locally. In practice that meant the README rendered with broken
placeholders for everyone reading on github.com. The PNGs are now
checked in and refreshed on every push-to-main via the workflow above.
