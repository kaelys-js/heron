# Data Contract

This document defines which files belong to the **system** (auto-updatable) and which belong to the **user** (never touched by updates).

## Multi-Profile Layout

Career-ops supports multiple distinct career identities ("profiles") per install. Each profile owns its own CV, targeting, pipeline, and applications data under `data/profiles/{slug}/`. The first install gets a `default` profile; users add more via `/onboarding?new=1` or `/profiles`.

**Shared infrastructure** is reused across every profile:
- `.env` (API keys + IMAP creds)
- `.playwright-linkedin/` and `.playwright-indeed/` (auth sessions)
- `data/profiles.json` (the registry + active-profile pointer)
- `data/sources.json` (per-source connection health)
- `data/onboarding-state.json` (wizard step state)
- `data/autopilot.json` (global scheduler config)
- `data/activity.jsonl` (global event log)
- `data/issues.jsonl` (open issues feed)
- `interview-prep/story-bank.md` (STAR stories cross-track)

**Per-profile content** lives under `data/profiles/{slug}/` — see below.

## User Layer (NEVER auto-updated)

These files contain your personal data, customizations, and work product. Updates will NEVER modify them.

### Per-profile files (one set per `data/profiles/{slug}/`)

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

### Shared user-layer files

| File | Purpose |
|------|---------|
| `interview-prep/story-bank.md` | Accumulated STAR+R stories (shared — stories transcend tracks) |
| `writing-samples/*` | Personal writing samples for style calibration |
| `jds/*` | Saved job descriptions |
| `data/inbox-mbox/*` | Local mbox drops for scan-email.mjs (shared drop-box) |
| `.env` | API keys + IMAP credentials |
| `data/profiles.json` | Profile registry + active selection |
| `data/sources.json` | Source connection state |
| `data/onboarding-state.json` | Wizard state |
| `data/autopilot.json` | Recurring schedule config |

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
| `modes/de/*` | German language modes |
| `modes/fr/*` | French language modes |
| `modes/ja/*` | Japanese language modes |
| `modes/pt/*` | Portuguese language modes |
| `modes/ru/*` | Russian language modes |
| `CLAUDE.md` | Agent instructions |
| `AGENTS.md` | Codex instructions |
| `*.mjs` | Utility scripts |
| `*.py` | Utility scripts |
| `lib-profiles.mjs`, `lib_profiles.py` | Shared profile-path helpers |
| `batch/batch-prompt.md` | Batch worker prompt |
| `batch/batch-runner.sh` | Batch orchestrator |
| `templates/*` | Base templates (including `cv-template.html`, `portals.example.yml`) |
| `fonts/*` | Self-hosted fonts |
| `.claude/skills/*` | Skill definitions |
| `docs/*` | Documentation |
| `VERSION` | Current version number |
| `DATA_CONTRACT.md` | This file |

## Migration

If you upgrade from a pre-multi-profile install (cv.md / config/profile.yml / portals.yml at the repo root), the dashboard's boot routine **automatically migrates** your files into `data/profiles/default/` on next start. Every moved file gets a `.bak` sibling at its original path for rollback safety. The migration runs once and is idempotent — booting again after migration is a no-op.

## The Rule

**If a file is in the User Layer, no update process may read, modify, or delete it.**

**If a file is in the System Layer, it can be safely replaced with the latest version from the upstream repo.**

## Resolving paths in scripts

If you're writing a new utility script that needs per-profile paths:

- **Node/MJS**: import from `lib-profiles.mjs` — use `profilePath(profileId, kind)` and `profileFromArgv()` to add a `--profile <slug>` CLI flag.
- **Python**: import from `lib_profiles.py` — same API.
- **Dashboard (TypeScript)**: import from `$lib/server/profile-paths.ts` — use `profilePath(id, kind)` for explicit profile, `activePath(kind)` when you just want the active one.
