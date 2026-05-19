# Screenshots

The main `README.md` references PNGs in this directory. They're
captured by running:

```bash
pnpm dev                            # in one terminal
pnpm screenshots                    # in another (uses Playwright)
```

The capture script is at `scripts/system/capture-screenshots.mjs`.

## What gets captured

| File | Route | Viewport | Theme |
|---|---|---|---|
| `inbox-light.png` | `/inbox` | 1440×900 | light |
| `inbox-dark.png` | `/inbox` | 1440×900 | dark |
| `evaluation-light.png` | `/inbox` | 1440×900 | light |
| `evaluation-dark.png` | `/inbox` | 1440×900 | dark |
| `autopilot.png` | `/autopilot` | 1440×900 | light |
| `patterns.png` | `/patterns` | 1440×900 | light |
| `interview-prep.png` | `/inbox` | 1440×900 | light |
| `mobile-inbox.png` | `/inbox` | 393×852 (iPhone 16 Pro) | light |
| `mobile-evaluation.png` | `/inbox` | 393×852 | light |

## Why aren't these checked in?

To avoid stale screenshots drifting from the UI. Each contributor
regenerates them against the current `main` before opening a docs-
focused PR. The README falls back gracefully (broken-image placeholder)
if a PNG is missing — alt text describes the intended content.

For a marketing-quality capture (post-launch), commit a curated set of
PNGs here. Re-run `pnpm screenshots` weekly to keep them current.
