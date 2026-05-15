# Scripts Reference

All scripts live in the project root as `.mjs` modules and are exposed via
`pnpm <name>` (which delegates to the `package.json` `scripts` block).

## Quick reference

| Command | Script | Purpose |
|---|---|---|
| `pnpm doctor` | `doctor.mjs` | Validate setup prerequisites |
| `pnpm verify` | `turbo test` | Full Vitest matrix (includes pipeline-integrity tests) |
| `pnpm normalize` | `normalize-statuses.mjs` | Fix non-canonical statuses |
| `pnpm dedup` | `dedup-tracker.mjs` | Remove duplicate tracker entries |
| `pnpm merge` | `merge-tracker.mjs` | Merge batch TSVs into applications.md |
| `pnpm pdf` | `generate-pdf.mjs` | Convert HTML to ATS-optimized PDF |
| `pnpm sync-check` | `cv-sync-check.mjs` | Validate CV/profile consistency |
| `pnpm update:check` | `update-system.mjs check` | Check for upstream updates |
| `pnpm update` | `update-system.mjs apply` | Apply upstream update |
| `pnpm rollback` | `update-system.mjs rollback` | Rollback last update |
| `pnpm liveness` | `check-liveness.mjs` | Test if job URLs are still active |
| `pnpm scan` | `scan.mjs` | Zero-token portal scanner |

The full canonical list of scripts is `package.json` → `scripts`.

---

## doctor

Validates that all prerequisites are in place: Node.js, dependencies installed,
Playwright Chromium, required files (`cv.md`, `config/profile.yml`, `portals.yml`),
`templates/fonts/` directory present, and auto-creates `data/`, `output/`,
`reports/` if missing.

```bash
pnpm doctor
```

**Exit codes:** `0` all checks passed, `1` one or more checks failed (fix
messages printed).

---

## verify

Aliased to `turbo test` — runs the full Vitest matrix. Pipeline-data integrity
is exercised by `ui/src/lib/integration/pipeline.integration.test.ts`, which
validates `data/applications.md` against the same rules the legacy
`verify-pipeline.mjs` used: canonical statuses (per `templates/states.yml`),
no duplicate company+role pairs, all report links point to existing files,
score format, row format, no pending TSVs in `batch/tracker-additions/`, and
no markdown bold in scores.

```bash
pnpm verify                                # full matrix
pnpm test --filter=ui-integration          # integration suite only
pnpm test -- pipeline.integration          # just the pipeline file
```

**Exit codes:** `0` all green, `1` any test failed.

---

## normalize

Maps non-canonical statuses to their canonical equivalents and strips markdown
bold and dates from the status column. Aliases like `Enviada` become `Aplicado`,
`CERRADA` becomes `Descartado`, etc. DUPLICADO info is moved to the notes column.

```bash
pnpm normalize             # apply changes
pnpm normalize -- --dry-run  # preview without writing
```

Creates a `.bak` backup of `applications.md` before writing.

**Exit codes:** `0` always (changes or no changes).

---

## dedup

Removes duplicate entries from `applications.md` by grouping on normalized
company name + fuzzy role match. Keeps the entry with the highest score. If a
removed entry had a more advanced pipeline status, that status is promoted to
the keeper.

```bash
pnpm dedup             # apply changes
pnpm dedup -- --dry-run  # preview without writing
```

Creates a `.bak` backup before writing.

**Exit codes:** `0` always.

---

## merge

Merges batch tracker additions (`batch/tracker-additions/*.tsv`) into
`applications.md`. Handles 9-column TSV, 8-column TSV, and pipe-delimited
markdown formats. Detects duplicates by report number, entry number, and
company+role fuzzy match. Higher-scored re-evaluations update existing entries
in place.

```bash
pnpm merge                 # apply merge
pnpm merge -- --dry-run    # preview without writing
pnpm merge -- --verify     # merge then run pipeline integrity tests
```

Processed TSVs are moved to `batch/tracker-additions/merged/`.

**Exit codes:** `0` success, `1` verification errors (with `--verify`).

---

## pdf

Renders an HTML file to a print-quality, ATS-parseable PDF via headless
Chromium. Resolves font paths from `templates/fonts/`, normalizes Unicode for
ATS compatibility (em-dashes, smart quotes, zero-width characters), and reports
page count and file size.

```bash
pnpm pdf -- input.html output.pdf
pnpm pdf -- input.html output.pdf --format=letter   # US letter
pnpm pdf -- input.html output.pdf --format=a4        # A4 (default)
```

**Exit codes:** `0` PDF generated, `1` missing arguments or generation failure.

---

## sync-check

Validates that the career-ops setup is internally consistent: `cv.md` exists
and is not too short, `config/profile.yml` exists with required fields, no
hardcoded metrics in `modes/_shared.md` or `batch/batch-prompt.md`, and
`article-digest.md` freshness (warns if older than 30 days).

```bash
pnpm sync-check
```

**Exit codes:** `0` no errors (warnings allowed), `1` errors found.

---

## update:check

Checks whether a newer version of career-ops is available upstream. Outputs
JSON to stdout:

```bash
pnpm update:check
```

Possible JSON responses:

| `status` | Meaning |
|---|---|
| `up-to-date` | Local version matches remote |
| `update-available` | Newer version exists (includes `local`, `remote`, `changelog`) |
| `dismissed` | User dismissed the update prompt |
| `offline` | Could not reach GitHub |
| `no-remote-version` | Reached GitHub but couldn't parse remote semver |

**Exit codes:** `0` always.

---

## update

Applies the upstream update. Creates a backup branch
(`backup-pre-update-{version}`), fetches from the canonical repo, checks out
only system-layer files, runs an install step, and commits. User-layer files
(`cv.md`, `config/profile.yml`, `data/`, etc.) are never touched.

```bash
pnpm update
```

**Exit codes:** `0` success, `1` lock conflict or safety violation.

---

## rollback

Restores system-layer files from the most recent backup branch created during
an update.

```bash
pnpm rollback
```

**Exit codes:** `0` success, `1` no backup branch found or git error.

---

## liveness

Tests whether job posting URLs are still live using headless Chromium. Detects
expired patterns (e.g. "job no longer available"), HTTP 404/410, ATS redirect
patterns, and apply-button presence. Supports multi-language expired patterns
(English, German, French).

```bash
pnpm liveness -- https://example.com/job/123
pnpm liveness -- https://a.com/job/1 https://b.com/job/2
pnpm liveness -- --file urls.txt
```

Each URL gets a verdict: `active`, `expired`, or `uncertain` with a reason.

**Exit codes:** `0` all URLs active, `1` any expired or uncertain.

---

## scan

Zero-token portal scanner. Hits ATS APIs (Greenhouse, Ashby, Lever) and career
pages directly — no LLM tokens consumed. Reads `portals.yml` for target
companies and search queries, outputs matching listings to stdout and
optionally appends to `data/pipeline.md`.

```bash
pnpm scan
```

**Exit codes:** `0` scan completed, `1` configuration error or no `portals.yml`
found.
