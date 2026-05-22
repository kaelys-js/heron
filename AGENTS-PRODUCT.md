# Heron -- product-specific agent context

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

> **What this file is.** Domain context for AI CLIs (Claude Code, Codex, Gemini, OpenCode, Qwen, Copilot) when they're running **product mode prompts** -- evaluating a job offer, generating a CV, scoring a portal scan, drafting outreach, etc. The dashboard's `spawnAgentWithMode()` loads this alongside [AGENTS.md](AGENTS.md) (engineering rules) so the spawned agent has both the rule discipline and the product-domain knowledge it needs.
>
> **Engineering rules** (think-before-coding, simplicity, surgical changes, etc.) live in [AGENTS.md](AGENTS.md). Anything in this file applies to product-mode work, not generic code-mode work.

## Heritage

This is a hard fork of an open-source CLI-driven job-search system. The
original archetypes, scoring logic, negotiation scripts, and proof-point
structure were designed around a specific career search; the fork
extends them with multi-user RBAC, a SvelteKit dashboard, Capacitor
native apps, and an autonomous-apply pipeline. See `README.md`
"Acknowledgements" for the upstream credit + case study link.

**It will work out of the box, but it's designed to be made yours.** If the archetypes don't match your career, the modes are in the wrong language, or the scoring doesn't fit your priorities -- just ask. You (AI Agent) can edit the user's files. The user says "change the archetypes to data engineering roles" and you do it. That's the whole point.

## Data Contract (CRITICAL)

There are two layers. Read `docs/DATA_CONTRACT.md` for the full list.

**User Layer (NEVER auto-updated, personalization goes HERE):**
- `cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`
- `data/*`, `reports/*`, `output/*`, `interview-prep/*`

**System Layer (auto-updatable, DON'T put user data here):**
- `modes/_shared.md`, `modes/evaluate.md`, all other modes
- `AGENTS.md`, `CLAUDE.md`, `*.mjs` scripts, `templates/*`, `batch/*`

**THE RULE: When the user asks to customize anything (archetypes, narrative, negotiation scripts, proof points, location policy, comp targets), ALWAYS write to `modes/_profile.md` or `config/profile.yml`. NEVER edit `modes/_shared.md` for user-specific content.** This ensures system updates don't overwrite their customizations.

## Update Check

On the first message of each session, run the update checker silently:

```bash
node scripts/system/update-system.mjs check
```

Parse the JSON output:
- `{"status": "update-available", "local": "1.0.0", "remote": "1.1.0", "changelog": "..."}` → tell the user:
  > "heron update available (v{local} → v{remote}). Your data (CV, profile, tracker, reports) will NOT be touched. Want me to update?"
  If yes → run `node scripts/system/update-system.mjs apply`. If no → run `node scripts/system/update-system.mjs dismiss`.
- `{"status": "up-to-date"}` → say nothing
- `{"status": "dismissed"}` → say nothing
- `{"status": "offline"}` → say nothing
- `{"status": "no-remote-version"}` → say nothing (checker reached GitHub but neither VERSION nor the latest release tag parsed as semver -- treat as a silent non-failure, same as offline)

The user can also say "check for updates" or "update Heron" at any time to force a check.
To rollback: `node scripts/system/update-system.mjs rollback`

## What is Heron

AI-powered, CLI-agnostic job search automation: pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing. Runs on any AI coding CLI that follows the [open agent skill standard](https://agentskills.io) (Claude Code, Codex, Gemini, OpenCode, Qwen, Copilot, Kimi).

### Main Files

| File | Function |
|------|----------|
| `data/applications.md` | Application tracker |
| `data/pipeline.md` | Inbox of pending URLs |
| `data/scan-history.tsv` | Scanner dedup history |
| `portals.yml` | Query and company config |
| `templates/cv-template.html` | HTML template for CVs |
| `templates/cv-template.tex` | LaTeX/Overleaf template for CVs |
| `scripts/cv/generate-pdf.mjs` | Playwright: HTML to PDF |
| `scripts/cv/generate-latex.mjs` | LaTeX CV validator + pdflatex compiler |
| `article-digest.md` | Compact proof points from portfolio (optional) |
| `interview-prep/story-bank.md` | Accumulated STAR+R stories across evaluations |
| `interview-prep/{company}-{role}.md` | Company-specific interview intel reports |
| `scripts/tracker/analyze-patterns.mjs` | Pattern analysis script (JSON output) |
| `scripts/tracker/followup-cadence.mjs` | Follow-up cadence calculator (JSON output) |
| `data/follow-ups.md` | Follow-up history tracker |
| `scripts/scan/scan.mjs` | Zero-token portal scanner -- hits Greenhouse/Ashby/Lever APIs directly, zero LLM cost |
| `scripts/system/check-liveness.mjs` | Job posting liveness checker |
| `scripts/system/liveness-core.mjs` | Shared liveness logic (expired signals win over generic Apply text) |
| `reports/` | Evaluation reports (format: `{###}-{company-slug}-{YYYY-MM-DD}.md`). Blocks A-F + G (Posting Legitimacy). Header includes `**Legitimacy:** {tier}`. |

### Multi-Profile Layout (read this first)

Heron supports MULTIPLE distinct career identities ("profiles") per install AND multiple users sharing one machine. Per-profile content lives under `data/users/{userId}/profiles/{slug}/` (or `data/profiles/{slug}/` in legacy single-user mode):

```text
data/users/{userId}/profiles/{slug}/
├── cv.md
├── profile.yml
├── _profile.md            ← per-profile copy of modes/_profile.md
├── portals.yml
├── article-digest.md
├── pipeline.md
├── applications.md
├── scan-history.tsv
├── gemini-scores.tsv
├── follow-ups.md
├── projects.json
├── reports/
├── output/                ← incl. cv-general.pdf
├── interview-prep/        ← per-company files
├── jds/                   ← saved JD text files (referenced as `local:<file>`)
└── writing-samples/       ← voice-calibration samples (emails, blog posts, etc.)
```

Plus a per-user, cross-profile namespace at `data/users/{userId}/profiles/_shared/`:

```text
data/users/{userId}/profiles/_shared/
└── story-bank.md          ← STAR+R interview stories; shared across this user's
                             profiles (engineer + instructor draw on the same
                             real-project stories) but PRIVATE to this user
```

**Globally shared infrastructure** (NOT per-profile, NOT per-user -- same for everyone on this machine): `.env` (machine-wide infrastructure only -- `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `HERON_DATA_DIR`, `HERON_UPDATE_*`), `data/profiles.json`, `data/activity.jsonl`, `data/issues.jsonl`, `data/inbox-mbox/`. NOTE: `data/sources.json`, `data/onboarding-state.json`, `data/autopilot.json` have moved per-user to `data/users/{uid}/profiles/_shared/`. `.playwright-{portal}/` Chromium sessions are also per-user under `data/users/{uid}/` (or `data/profiles/_shared/` for legacy single-user) -- the persistent dir IS the credential and must never be shared across users.

**Personal credentials are per-user**, NOT in `.env`. The keys `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `OPENAI_API_KEY`, `ADZUNA_APP_ID/KEY`, `GMAIL_IMAP_*` live in `data/users/{uid}/profiles/_shared/secrets.json` -- AES-256-GCM encrypted at rest with a key derived via HKDF(`BETTER_AUTH_SECRET` + per-user random salt). Each user manages their own via Settings → API Keys. Resolution order in code: per-user store first, then `.env` fallback for legacy single-user installs. On first boot after upgrade, install-wide `.env` values are silently migrated into the OWNER's per-user store (idempotent -- `.env` still works as fallback until the maintainer deletes the keys). See `ui/src/lib/server/user-secrets.ts` + `scripts/lib/user-secrets.mjs` (JS twin for CLI scripts).

**Active profile**: `data/profiles.json` has `{ activeId, profiles: [...] }`. Reads default to the active profile unless an explicit `--profile <slug>` flag (Python/MJS scripts) or `?profile=<slug>` query param (dashboard routes) is passed.

**Mode prompts use absolute paths.** Every `modes/*.md` prompt references files via `__TOKEN__` placeholders (e.g. `__CV__`, `__REPORTS__`, `__STORY_BANK__`). The dashboard's `spawnAgentWithMode()` resolves each token to the active profile's absolute on-disk path BEFORE handing the prompt to the AI CLI. No repo-root symlinks, no shell-cwd magic -- the AI sees fully-qualified paths and can never read the wrong profile's data. Token vocabulary documented in `modes/_TOKENS.md`.

**Invocation is dashboard-only.** The slash-command flow (`claude "/heron evaluate <url>"` in a terminal) has been deprecated. Mode prompts are loaded by the dashboard's orchestrator, substituted, and passed to Claude via `--append-system-prompt-file`. Direct-CLI invocation is not supported.

**When the user asks for personalization**, ALWAYS write to the active profile's files at `data/users/{userId}/profiles/{slug}/...` (or `data/profiles/{slug}/...` in legacy single-user mode). Never write to `data/profiles/default/` directly when the user might be on a different profile -- let the dashboard's active-profile selection drive the path.

### First Run -- Onboarding (IMPORTANT)

**Before doing ANYTHING else, check if the system is set up.** Run these checks silently every time a session starts:

1. Does `data/profiles.json` exist? If yes, read it -- `activeId` tells you which profile to operate on.
2. Does the active profile's `cv.md` exist? (at `data/users/{uid}/profiles/{slug}/cv.md` -- or the legacy `data/profiles/{slug}/cv.md` in single-user mode)
3. Does the active profile's `profile.yml` exist?
4. Does the active profile's `_profile.md` exist?
5. Does the active profile's `portals.yml` exist?

If `data/profiles.json` is missing, the install is pre-multi-profile. The dashboard's boot routine auto-migrates the flat layout into `data/profiles/default/` on next start -- let the dashboard handle this rather than running scripts that read the old paths.

**If the active profile is incomplete, enter onboarding mode.** Do NOT proceed with evaluations, scans, or any other mode until the basics are in place. Guide the user step by step (paths below are unqualified for readability -- the dashboard's spawn-time substitution resolves them against the active profile + user, so `cv.md` writes via the orchestrator land in `data/users/{uid}/profiles/{slug}/cv.md`):

#### Step 1: CV (required)
If `cv.md` is missing, ask:
> "I don't have your CV yet. You can either:
> 1. Paste your CV here and I'll convert it to markdown
> 2. Paste your LinkedIn URL and I'll extract the key info
> 3. Tell me about your experience and I'll draft a CV for you
>
> Which do you prefer?"

Create `cv.md` from whatever they provide. Make it clean markdown with standard sections (Summary, Experience, Projects, Education, Skills).

#### Step 2: Profile (required)
If `config/profile.yml` is missing, copy from `templates/profile.example.yml` and then ask:
> "I need a few details to personalize the system:
> - Your full name and email
> - Your location and timezone
> - What roles are you targeting? (e.g., 'Senior Backend Engineer', 'AI Product Manager')
> - Your salary target range
>
> I'll set everything up for you."

Fill in `config/profile.yml` with their answers. For archetypes and targeting narrative, store the user-specific mapping in `modes/_profile.md` or `config/profile.yml` rather than editing `modes/_shared.md`.

#### Step 3: Portals (recommended)
If `portals.yml` is missing:
> "I'll set up the job scanner with 45+ pre-configured companies. Want me to customize the search keywords for your target roles?"

Copy `templates/portals.example.yml` → `portals.yml`. If they gave target roles in Step 2, update `title_filter.positive` to match.

#### Step 4: Tracker
If `data/applications.md` doesn't exist, create it:
```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

#### Step 5: Get to know the user (important for quality)

After the basics are set up, proactively ask for more context. The more you know, the better your evaluations will be:

> "The basics are ready. But the system works much better when it knows you well. Can you tell me more about:
> - What makes you unique? What's your 'superpower' that other candidates don't have?
> - What kind of work excites you? What drains you?
> - Any deal-breakers? (e.g., no on-site, no startups under 20 people, no Java shops)
> - Your best professional achievement -- the one you'd lead with in an interview
> - Any projects, articles, or case studies you've published?
>
> The more context you give me, the better I filter. Think of it as onboarding a recruiter -- the first week I need to learn about you, then I become invaluable."

Store any insights the user shares in `config/profile.yml` (under narrative), `modes/_profile.md`, or in `article-digest.md` if they share proof points. Do not put user-specific archetypes or framing into `modes/_shared.md`.

**After every evaluation, learn.** If the user says "this score is too high, I wouldn't apply here" or "you missed that I have experience in X", update your understanding in `modes/_profile.md`, `config/profile.yml`, or `article-digest.md`. The system should get smarter with every interaction without putting personalization into system-layer files.

#### Step 6: Ready
Once all files exist, confirm:
> "You're all set! You can now:
> - Paste a job URL to evaluate it
> - Run `/heron scan` (or `/heron-scan` if using OpenCode) to search portals
> - Run `/heron` to see all commands
>
> Everything is customizable -- just ask me to change anything.
>
> Tip: Having a personal portfolio dramatically improves your job search. A simple GitHub Pages site or static HTML CV is enough -- recruiters search for proof of work, not for design awards."

Then suggest automation:
> "Want me to scan for new offers automatically? I can set up a recurring scan every few days so you don't miss anything. Just say 'scan every 3 days' and I'll configure it."

If the user accepts, use the `/loop` or `/schedule` skill (if available) to set up a recurring `/heron scan` (or `/heron-scan` if using OpenCode). If those aren't available, suggest adding a cron job or remind them to run `/heron scan` (or `/heron-scan` if using OpenCode) periodically.

### Personalization

This system is designed to be customized by YOU (AI Agent). When the user asks you to change archetypes, translate modes, adjust scoring, add companies, or modify negotiation scripts -- do it directly. You read the same files you use, so you know exactly what to edit.

**Common customization requests:**
- "Change the archetypes to [backend/frontend/data/devops] roles" → edit `modes/_profile.md` or `config/profile.yml`
- "Translate the modes to English" → edit all files in `modes/`
- "Add these companies to my portals" → edit `portals.yml`
- "Update my profile" → edit `config/profile.yml`
- "Change the CV template design" → edit `templates/cv-template.html`
- "Adjust the scoring weights" → edit `modes/_profile.md` for user-specific weighting, or edit `modes/_shared.md` and `modes/batch-prompt.md` only when changing the shared system defaults for everyone

### Language Modes

All modes ship in English under `modes/*.md`. Locale-specific
translations (`modes/de/`, `modes/fr/`, `modes/ja/`, …) were dropped
in commit `7e3fd99` after the maintenance burden of keeping 7 × N
locale files in lock-step exceeded the value for the user base.

`profile.yml::language.modes_dir` still works as a hook: if a user
restores a locale directory and points to it, `lib/server/modes.ts`
resolves localised files first and falls back to English on a miss.
`scripts/system/verify-i18n.mjs` (run via `pnpm i18n:verify`) gates
locale parity if any directory is reintroduced.

For now the AI CLI handles localisation in-prompt -- when a user
targets a German posting, the English prompt + the German JD
together produce German output from the model, with the locale-
specific terminology cited inline. No file-level translation is
maintained.

### Skill Modes

| If the user... | Mode |
|----------------|------|
| Pastes JD or URL | auto-pipeline (evaluate + report + PDF + tracker) |
| Asks to evaluate offer | `evaluate` |
| Asks to compare offers | `compare` |
| Wants LinkedIn outreach | `outreach` |
| Asks for company research | `deep` |
| Preps for interview at specific company | `interview-prep` |
| Wants to generate CV/PDF | `pdf` |
| Evaluates a course/cert | `training` |
| Evaluates portfolio project | `project` |
| Asks about application status | `tracker` |
| Fills out application form | `apply` |
| Searches for new offers | `scan` |
| Processes pending URLs | `pipeline` |
| Batch processes offers | `batch` |
| Asks about rejection patterns or wants to improve targeting | `patterns` |
| Asks about follow-ups or application cadence | `followup` |

### CV Source of Truth

- `cv.md` in project root is the canonical CV
- `article-digest.md` has detailed proof points (optional)
- **NEVER hardcode metrics** -- read them from these files at evaluation time

---

## Ethical Use -- CRITICAL

**This system is designed for quality, not quantity.** The goal is to help the user find and apply to roles where there is a genuine match -- not to spam companies with mass applications.

- **By default, NEVER submit an application without the user reviewing it first.** Fill forms, draft answers, generate PDFs -- but stop at Submit. The user makes the final call.
- **Autonomous mode is opt-in per profile.** When `profile.yml.automation.autonomous_apply: true`, the system MAY auto-submit on supported portals (LinkedIn, Greenhouse, Ashby) ONLY when ALL four conditions hold:
  1. The job's score is ≥ `automation.min_score_to_apply` (default 4.0)
  2. The daily cap (`thresholds.maxAppliesPerDay`, plus the per-profile `automation.warmup_days` window) hasn't been hit
  3. The portal's automation is supported AND no CAPTCHA / anti-bot / unknown-required-field is encountered
  4. The pre-apply assembly (tailored CV + cover letter) succeeded
  If ANY of those fail, the job falls back to `ManualApplyNeeded` and the user finishes by hand from the Inbox.
- **Strongly discourage low-fit applications.** If a score is below 4.0/5, explicitly recommend against applying. The user's time and the recruiter's time are both valuable. Only proceed if the user has a specific reason to override the score.
- **Quality over speed.** A well-targeted application to 5 companies beats a generic blast to 50. Guide the user toward fewer, better applications.
- **Respect recruiters' time.** Every application a human reads costs someone's attention. Only send what's worth reading.

---

## Offer Verification -- MANDATORY

**NEVER trust WebSearch/WebFetch to verify if an offer is still active.** ALWAYS use Playwright:
1. `browser_navigate` to the URL
2. `browser_snapshot` to read content
3. Only footer/navbar without JD = closed. Title + description + Apply = active.

**Exception for batch workers (headless mode):** Playwright is not available in headless pipe mode. Use WebFetch as fallback and mark the report header with `**Verification:** unconfirmed (batch mode)`. The user can verify manually later.

---

## Headless / Batch Mode

When spawning headless workers for batch processing, use the appropriate command for your CLI:

| CLI | Command |
|-----|---------|
| Claude Code | `claude -p "prompt"` |
| Gemini CLI | `gemini -p "prompt"` |
| Copilot CLI | `copilot -p "prompt"` |
| Codex | `codex exec "prompt"` |
| OpenCode | `opencode run "prompt"` |
| Qwen | `qwen -p "prompt"` |

## Switching the AI CLI

The dashboard spawns an AI CLI binary for every slash-command-driven flow
(evaluate, cover-letter, outreach, post-rejection, form-answers, followup-draft,
answer-form, batch-runner). The binary is read from the `AGENT_CLI`
environment variable; it defaults to `claude`.

```sh
# default -- Claude Code
pnpm dev

# Gemini CLI
AGENT_CLI=gemini pnpm dev

# Codex
AGENT_CLI=codex pnpm dev

# any other CLI on PATH
AGENT_CLI=opencode pnpm dev
```

**Caveat**: Heron still passes Claude-Code-specific flags to every
spawn (`--dangerously-skip-permissions`, `--append-system-prompt-file`,
`--model sonnet`). Other CLIs may need adapter shims that translate or
strip those flags. Track per-CLI compatibility in
[issues](https://github.com/kaelys-js/heron/issues) -- the abstraction
ships intentionally minimal so adapter work is incremental and discoverable.

Single source of truth: `ui/src/lib/config/cli.ts`.

## Stack and Conventions

- Node.js (mjs modules), Playwright (PDF + scraping), YAML (config), HTML/CSS (template), Markdown (data), Canva MCP (optional visual CV)
- Scripts in `.mjs`, configuration in YAML
- Output in `output/` (gitignored), Reports in `reports/`
- JDs in `jds/` (referenced as `local:jds/{file}` in pipeline.md)
- Batch in `batch/` (gitignored except scripts and prompt)
- Report numbering: sequential 3-digit zero-padded, max existing + 1
- **RULE: After each batch of evaluations, run `node scripts/tracker/merge-tracker.mjs`** to merge tracker additions and avoid duplications.
- **RULE: NEVER create new entries in applications.md if company+role already exists.** Update the existing entry.

### TSV Format for Tracker Additions

Write one TSV file per evaluation to the active profile's `batch/tracker-additions/{num}-{company-slug}.tsv` (resolves to `data/users/{uid}/profiles/{slug}/batch/tracker-additions/` for the active user, or `data/profiles/{slug}/batch/tracker-additions/` in legacy single-user installs). Single line, 9 tab-separated columns:

```text
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf_emoji}\t[{num}](reports/{num}-{slug}-{date}.md)\t{note}
```

**Column order (IMPORTANT -- status BEFORE score):**
1. `num` -- sequential number (integer)
2. `date` -- YYYY-MM-DD
3. `company` -- short company name
4. `role` -- job title
5. `status` -- canonical status (e.g., `Evaluated`)
6. `score` -- format `X.X/5` (e.g., `4.2/5`)
7. `pdf` -- `✅` or `❌`
8. `report` -- markdown link `[num](reports/...)`
9. `notes` -- one-line summary

**Note:** In applications.md, score comes BEFORE status. The merge script handles this column swap automatically.

### Pipeline Integrity

1. **NEVER edit applications.md to ADD new entries** -- Write TSV in the active profile's `batch/tracker-additions/` and `scripts/tracker/merge-tracker.mjs` handles the merge.
2. **YES you can edit applications.md to UPDATE status/notes of existing entries.**
3. All reports MUST include `**URL:**` in the header (between Score and PDF). Include `**Legitimacy:** {tier}` (see Block G in `modes/evaluate.md`).
4. All statuses MUST be canonical (see `data/states.yml`).
5. Health check: `pnpm test --filter=ui-integration` (pipeline.integration.test.ts validates this)
6. Normalize statuses: `node scripts/tracker/normalize-statuses.mjs`
7. Dedup: `node scripts/tracker/dedup-tracker.mjs`

### Canonical States (applications.md)

**Source of truth:** `data/states.yml`

| State | When to use |
|-------|-------------|
| `Evaluated` | Report completed, pending decision |
| `Applied` | Application sent |
| `Responded` | Company responded |
| `Interview` | In interview process |
| `Offer` | Offer received |
| `Rejected` | Rejected by company |
| `Discarded` | Discarded by candidate or offer closed |
| `SKIP` | Doesn't fit, don't apply |

**RULES:**
- No markdown bold (`**`) in status field
- No dates in status field (use the date column)
- No extra text (use the notes column)
