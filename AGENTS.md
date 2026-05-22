# AGENTS.md -- engineering rules + Heron orientation

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

> **What this file is.** The engineering rules every AI agent follows when doing CODE work in this repo (refactors, CI fixes, feature work, code review). It's deliberately short -- read these first, then [AGENTS-PRODUCT.md](AGENTS-PRODUCT.md) for product-specific domain context (modes, profile layout, scoring, ethical-use policy, etc.).
>
> Code-mode agents (you, CodeRabbit reviews, refactor sessions) only need this file. Product-mode agents that the dashboard spawns via `spawnAgentWithMode()` get both: this file PLUS [AGENTS-PRODUCT.md](AGENTS-PRODUCT.md).

## 12 rules

These apply to every code task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

### Rule 1 -- Think before coding
State assumptions explicitly. If uncertain, ask rather than guess.
Present multiple interpretations when ambiguity exists.
Push back when a simpler approach exists.
Stop when confused. Name what's unclear.

### Rule 2 -- Simplicity first
Minimum code that solves the problem. Nothing speculative.
No features beyond what was asked. No abstractions for single-use code.
Test: would a senior engineer say this is overcomplicated? If yes, simplify.

### Rule 3 -- Surgical changes
Touch only what you must. Clean up only your own mess.
Don't "improve" adjacent code, comments, or formatting.
Don't refactor what isn't broken. Match existing style.

### Rule 4 -- Goal-driven execution
Define success criteria. Loop until verified.
Don't follow steps. Define success and iterate.
Strong success criteria let you loop independently.

### Rule 5 -- Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

### Rule 6 -- Token budgets are not advisory
Per-task: 4,000 tokens. Per-session: 30,000 tokens.
If approaching budget, summarize and start fresh.
Surface the breach. Do not silently overrun.

### Rule 7 -- Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

### Rule 8 -- Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

### Rule 9 -- Tests verify intent, not just behaviour
Tests must encode WHY behaviour matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

### Rule 10 -- Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

### Rule 11 -- Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

### Rule 12 -- Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

---

## Heron orientation (90 seconds)

Heron is a local-first job-search platform -- pipeline tracking, A-F offer evaluation, ATS-optimized CVs, 11-portal scanning, recruiter email triage, interview prep, opt-in autonomous apply. The repo has two layers:

1. **Engineering layer.** SvelteKit dashboard (`ui/`), Capacitor native apps (iOS/Android/Watch via `ui/ios/` + `ui/android/`), Electron desktop (`ui/electron/`), Node.js scripts (`scripts/`). Standard web/native tooling: TypeScript, Vitest, XCTest, Playwright, etc.

2. **Product layer.** Modes (`modes/*.md`) that AI CLIs run for product workflows (`evaluate`, `apply`, `outreach`, etc.). Per-user / per-profile data (`data/users/{uid}/profiles/{slug}/`). Application tracker, reports, CV templates, scoring logic.

If your task touches the **engineering layer only** (CI, build, refactor, bug fix in `ui/` or `scripts/`), the 12 rules above are everything you need. If it touches the **product layer** (changing a mode prompt, adjusting scoring, anything in `data/` or `modes/_profile.md`), **read [AGENTS-PRODUCT.md](AGENTS-PRODUCT.md) first** -- it has the data contract (which files agents can vs. can't auto-update), the multi-profile path resolution rules, the canonical states, etc.

## Critical safety guardrails (one-liner each -- see AGENTS-PRODUCT.md for full)

- **Data Contract**: NEVER overwrite user files (`cv.md`, `config/profile.yml`, `modes/_profile.md`, `article-digest.md`, `portals.yml`, anything under `data/`/`reports/`/`output/`/`interview-prep/`). Personalization writes go to `modes/_profile.md` or `config/profile.yml`, never `modes/_shared.md`.
- **Ethical use**: Autonomous apply is opt-in per profile and gated on 4 conditions (score ≥ threshold, daily cap, portal supports it, pre-apply succeeded). Never submit on the user's behalf without those guards.
- **Offer verification**: Use Playwright `browser_snapshot`, never WebFetch/WebSearch alone, to confirm a posting is still active.

Full text + the rest of the product-mode rules: [AGENTS-PRODUCT.md](AGENTS-PRODUCT.md).

---

## Engineering tooling reference

### Tooling stack (mise + lefthook + biome + turborepo + pnpm)

| Tool | Role | Config |
|---|---|---|
| **mise** | Auto-manages Node + pnpm + Ruby versions per directory | `.mise.toml` |
| **pnpm** | Package manager + workspace orchestration | `package.json::packageManager`, `pnpm-workspace.yaml` |
| **turbo** | Task graph + cache for `build` / `check` / `brand` across workspaces | `turbo.json` |
| **biome** | Format-only (no linting -- svelte-check covers that) | `biome.jsonc` |
| **lefthook** | Git hooks manager (pre-commit + pre-push) | `lefthook.yml` |

**Hooks (lefthook):**

- `pre-commit` (parallel):
  - `apply-brand` -- if any `branding/*` file is staged, re-runs apply-brand and re-stages all propagated files
  - `biome-format` -- formats staged `.ts/.tsx/.js/.mjs/.svelte/.json` in place
  - `no-secrets` -- regex-blocks Anthropic keys / GitHub PATs / AWS keys / private keys
- `pre-push` (sequential):
  - `typecheck` -- svelte-check + tsgo, turbo-cached
  - `vitest` -- full Vitest matrix (unit + server + browser-mode + integration + electron) via turbo
  - `format-check` -- biome + prettier
  - `release-readiness` -- gated when a release tag is being pushed

Bypass with `--no-verify` if you must (don't).

**Daily commands:**

| | |
|---|---|
| `pnpm dev` | turbo runs `vite dev` in `ui/` (auto-applies brand at startup via the vite plugin) |
| `pnpm build` | turbo runs every workspace's build with task-graph parallelism + caching |
| `pnpm format` | `biome format --write .` over the repo |
| `pnpm format:check` | check-only, used by CI |
| `pnpm check` | turbo runs `svelte-check` in all workspaces |

CI uses `jdx/mise-action@v2` so the same versions install in GitHub runners as on your local machine.

### Branding -- single source of truth

`branding/brand.json` + `branding/logo.svg` are the **only** files you edit when rebranding. Running `pnpm brand:apply` propagates these into every consumer (package.json × 3, Capacitor configs × 2, electron-builder, Info.plist, Brand.swift × 4 extension targets, brand.ts × 2, manifest, fastlane, icons). Source code reads brand from generated `brand.ts` / `Brand.swift` -- never hardcode `com.resistjs.heron`, `heron://`, `_heron._tcp` in runtime code.

Vitest's `capacitor.integration.test.ts` checks every consumer matches `brand.json` -- drift fails CI.

### Release automation (Conventional Commits → Release Please → native-release)

Releases are fully automated. You don't run a release command -- you write commits in [Conventional Commits](https://www.conventionalcommits.org/) format and Release Please does the rest.

| Prefix | Bump | Example |
|---|---|---|
| `feat: ...` | minor | `feat: add LinkedIn audit mode` |
| `fix: ...` | patch | `fix: handle empty pipeline gracefully` |
| `perf: ...` | patch | `perf: cache /api/stats response` |
| `feat!: ...` OR `BREAKING CHANGE:` body | major | `feat!: drop adapter-auto` |
| `chore:` `docs:` `refactor:` `test:` `ci:` `build:` `style:` | **no release** | `chore: bump deps` |

Flow: merge PR to `main` (squash) → Release Please accumulates commits into a long-lived "release PR" → merge that PR → Release Please tags `vX.Y.Z` + updates CHANGELOG.md + GitHub Release. `release.yml` then triggers `native-release.yml` (workflow_call) to build DMG/exe/AppImage + upload to TestFlight.

Source of truth: `release-please-config.json`, `.github/workflows/release.yml`, `.github/workflows/native-release.yml`.

### CI/CD posture

- **GitHub Actions** on every PR: `pnpm test` (Vitest matrix, 1500+ cases), `pnpm test:ios:ci` (Fastlane test_ci → xcov), auto-labeler (risk-based), welcome bot for first-time contributors
- **Branch protection** on `main`: 16 required status checks, signed commits, required PR, required CodeOwners review. No direct pushes to main (except admin bypass). Squash-merge required so every merge = one Conventional commit.
- **Dependabot** monitors npm, Go modules, and GitHub Actions for security updates
- **Reconciliation workflows** (push:main + weekly cron):
  - `maintain-config.yml` → description/topics/rulesets/GHAS via `scripts/system/apply-github-config.mjs`
  - `maintain-features.yml` → envs/labels/validity-checks/Pages via `scripts/system/apply-github-features.mjs`
  - `maintain-user-features.yml` → pinned Roadmap issue / pinned discussions / Project v2 / profile README via `scripts/system/apply-user-features.mjs` (uses `GH_USER_PAT`)
- **Contributing process**: issue first → discussion → PR with linked issue → CI passes → maintainer review → merge

### Community + governance

- **Code of Conduct**: Contributor Covenant 2.1 (`.github/CODE_OF_CONDUCT.md`)
- **Governance**: BDFL model with contributor ladder -- Participant → Contributor → Triager → Reviewer → Maintainer (`docs/GOVERNANCE.md`)
- **Security**: private vulnerability reporting via email (`.github/SECURITY.md`)
- **Support**: help questions go to Discord/Discussions, not issues
- **Discord**: <https://discord.gg/MyFbztUK5U>
