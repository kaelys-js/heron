# Data Contract

This document defines which files belong to the **system** (auto-updatable) and which belong to the **user** (never touched by updates).

## Multi-Profile Layout

Career-ops supports multiple distinct career identities ("profiles") per install. Each profile owns its own CV, targeting, pipeline, and applications data under `data/profiles/{slug}/`. The first install gets a `default` profile; users add more via `/onboarding?new=1` or `/profiles`.

**Globally shared infrastructure** is reused across every profile AND every user:
- `.env` (API keys + IMAP creds — per-machine, NOT in git)
- `.playwright-linkedin/` and `.playwright-indeed/` (auth sessions)
- `data/profiles.json` (the registry + active-profile pointer)
- `data/sources.json` (per-source connection health)
- `data/onboarding-state.json` (wizard step state)
- `data/autopilot.json` (global scheduler config)
- `data/activity.jsonl` (global event log)
- `data/issues.jsonl` (open issues feed)
- `data/inbox-mbox/*` (shared mbox drop-box for `scripts/scan/scan-email.mjs`)

**Per-user, cross-profile content** lives at `data/users/{userId}/profiles/_shared/` (or `data/profiles/_shared/` in legacy single-user mode):
- `story-bank.md` — accumulated STAR+R stories that transcend the user's profiles (engineer + instructor profiles draw on the same real-project stories) but stay PRIVATE to that user.

**Per-profile content** lives at `data/users/{userId}/profiles/{slug}/` (or `data/profiles/{slug}/` in legacy single-user mode) — see below.

## User Layer (NEVER auto-updated)

These files contain your personal data, customizations, and work product. Updates will NEVER modify them.

### Per-profile files (one set per `data/users/{userId}/profiles/{slug}/`)

| File | Purpose |
|------|---------|
| `cv.md` | Your CV in markdown |
| `profile.yml` | Your identity, targets, comp range |
| `_profile.md` | Your archetypes, narrative, negotiation scripts |
| `portals.yml` | Your customized company list + title filter |
| `article-digest.md` | Your proof points from portfolio |
| `pipeline.md` | Your URL inbox |
| `applications.md` | Your application tracker |
| `scan-history.tsv` | Your scan history |
| `gemini-scores.tsv` | Gemini first-pass scores |
| `follow-ups.md` | Your follow-up history |
| `projects.json` | Saved filter views |
| `reports/*` | Your evaluation reports |
| `output/*` | Your generated PDFs (incl. `cv-general.pdf`) |
| `interview-prep/*` | Per-company interview prep briefs |
| `jds/*` | Saved job descriptions (referenced as `local:<file>` in pipeline.md) |
| `writing-samples/*` | Personal writing samples used to calibrate the CV/cover-letter voice |

### Per-user, shared-across-profiles files (`data/users/{userId}/profiles/_shared/`)

| File | Purpose |
|------|---------|
| `story-bank.md` | Accumulated STAR+R stories. Lives ABOVE the per-profile dirs so the same stories serve every profile of the same user — but never leak to other users. |

### Globally shared user-layer files

| File | Purpose |
|------|---------|
| `data/inbox-mbox/*` | Local mbox drops for scripts/scan/scan-email.mjs (shared drop-box) |
| `.env` | API keys + IMAP credentials |
| `data/profiles.json` | Profile registry + active selection |
| `data/sources.json` | Source connection state |
| `data/onboarding-state.json` | Wizard state |
| `data/autopilot.json` | Recurring schedule config |

### Repo-root compatibility symlinks (managed by `ui/src/lib/server/profile-symlinks.ts`)

The AI CLI (Claude Code / Codex / etc.) reads its inputs at the repo root, not at the per-profile paths. To bridge that, the dashboard lazily creates symlinks just before every CLI spawn:

| Symlink at repo root | Points to (active profile) |
|---|---|
| `cv.md` | `data/users/{uid}/profiles/{slug}/cv.md` |
| `config/profile.yml` | `data/users/{uid}/profiles/{slug}/profile.yml` |
| `portals.yml` | `data/users/{uid}/profiles/{slug}/portals.yml` |
| `modes/_profile.md` | `data/users/{uid}/profiles/{slug}/_profile.md` |
| `jds/` | `data/users/{uid}/profiles/{slug}/jds/` |
| `writing-samples/` | `data/users/{uid}/profiles/{slug}/writing-samples/` |
| `interview-prep/` | `data/users/{uid}/profiles/{slug}/interview-prep/` |
| `interview-prep/story-bank.md` | `data/users/{uid}/profiles/_shared/story-bank.md` (user-shared) |

If you `git pull` + `ls cv.md` at repo root and see "No such file", that's expected — boot the dashboard and any `/api/job/[id]/*` endpoint hit will recreate the symlinks before spawning the CLI.

## System Layer (safe to auto-update)

These files contain system logic, scripts, templates, and instructions that improve with each release.

| File | Purpose |
|------|---------|
| `modes/_shared.md` | Scoring system, global rules, tools |
| `modes/_profile.template.md` | Template seed for per-profile `_profile.md` |
| `modes/oferta.md` | Evaluation mode instructions |
| `modes/pdf.md` | PDF generation instructions |
| `modes/scan.md` | Portal scanner instructions |
| `modes/batch.md` | Batch processing instructions |
| `modes/apply.md` | Application assistant instructions |
| `modes/auto-pipeline.md` | Auto-pipeline instructions |
| `modes/contacto.md` | LinkedIn outreach instructions |
| `modes/deep.md` | Research prompt instructions |
| `modes/ofertas.md` | Comparison instructions |
| `modes/pipeline.md` | Pipeline processing instructions |
| `modes/project.md` | Project evaluation instructions |
| `modes/tracker.md` | Tracker instructions |
| `modes/training.md` | Training evaluation instructions |
| `modes/patterns.md` | Pattern analysis instructions |
| `modes/followup.md` | Follow-up cadence instructions |
| `CLAUDE.md` | Agent instructions |
| `AGENTS.md` | Codex instructions |
| `scripts/apply/*` | Autonomous-apply portal adapters (apply-portal.py + per-portal scripts + lib_apply.py + lib_portal.py) |
| `scripts/scan/*` | Portal + email scanners |
| `scripts/cv/*` | PDF + LaTeX generation, ATS-check |
| `scripts/quality/*` | CV / cover-letter / resume quality gates |
| `scripts/tracker/*` | applications.md hygiene (merge / dedup / normalize / patterns) |
| `scripts/linkedin/*` | LinkedIn auxiliary (audit, DM scraper, profile extract) |
| `scripts/system/*` | Repo plumbing (doctor, check-liveness, update-system, gemini-eval, …) |
| `scripts/lib/*` | Cross-domain shared libs (lib-profiles.mjs, lib_profiles.py, lib_playwright_auth.py) |
| `scripts/native/*` | Native build / dev / setup wizards |
| `batch/batch-prompt.md` | Batch worker prompt |
| `batch/batch-runner.sh` | Batch orchestrator |
| `templates/*` | Base templates (including `cv-template.html`, `portals.example.yml`, `fonts/`) |
| `.claude/skills/*` | Skill definitions |
| `docs/*` | Documentation |
| `VERSION` | Current version number |
| `docs/DATA_CONTRACT.md` | This file |

## Migration

If you upgrade from a pre-multi-profile install (cv.md / config/profile.yml / portals.yml at the repo root), the dashboard's boot routine **automatically migrates** your files into `data/profiles/default/` on next start. Every moved file gets a `.bak` sibling at its original path for rollback safety. The migration runs once and is idempotent — booting again after migration is a no-op.

## The Rule

**If a file is in the User Layer, no update process may read, modify, or delete it.**

**If a file is in the System Layer, it can be safely replaced with the latest version from the upstream repo.**

## Resolving paths in scripts

If you're writing a new utility script that needs per-profile paths:

- **Node/MJS**: import from `scripts/lib/lib-profiles.mjs` — use `profilePath(profileId, kind)` and `profileFromArgv()` to add a `--profile <slug>` CLI flag.
- **Python**: import from `scripts/lib/lib_profiles.py` — same API.
- **Dashboard (TypeScript)**: import from `$lib/server/profile-paths.ts` — use `profilePath(id, kind)` for explicit profile, `activePath(kind)` when you just want the active one.

## Status vocabularies

career-ops tracks **two** status values per job, not one — the dashboard's
pipeline stage and the applications.md canonical state. They're orthogonal,
not equivalent. See [`docs/STATUS_MODEL.md`](docs/STATUS_MODEL.md) for the
full mapping table and the reason both exist.
