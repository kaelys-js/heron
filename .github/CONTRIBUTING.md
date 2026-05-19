# Contributing to Heron

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

Thanks for your interest in contributing! Heron is built with Claude Code, and you can use it for development too.

## Before Submitting a PR

**Please open an issue first to discuss the change you'd like to make.** This helps us align on direction before you invest time coding.

PRs without a corresponding issue may be closed if they don't align with the project's architecture or goals.

### What makes a good PR
- Fixes a bug listed in Issues
- Addresses a feature request that was discussed and approved
- Includes a clear description of what changed and why
- Follows the existing code style and project philosophy (simple, minimal, quality over quantity)

## Quick Start

1. Open an issue to discuss your idea
2. Fork the repo
3. Create a branch (`git checkout -b feature/my-feature`)
4. Make your changes
5. Test with a fresh clone (see [docs/SETUP.md](../docs/SETUP.md))
6. Commit and push
7. Open a Pull Request referencing the issue

## What to Contribute

**Good first contributions:**
- Add companies to `templates/portals.example.yml`
- Translate modes to other languages
- Improve documentation
- Add example CVs for different roles (in `docs/examples/`)
- Report bugs via [Issues](https://github.com/kaelys-js/heron/issues)

**Bigger contributions:**
- New evaluation dimensions or scoring logic
- Dashboard features (in `ui/` — SvelteKit)
- New skill modes (in `modes/`)
- Script improvements (`.mjs` utilities)

## Guidelines

- Keep modes language-agnostic when possible (Claude handles both EN and ES)
- Scripts should handle missing files gracefully (check `existsSync` before `readFileSync`)
- Dashboard changes require `go build` — test with real data before submitting
- Don't commit personal data (cv.md, profile.yml, applications.md, reports/)

## Developer Certificate of Origin (DCO)

Every commit MUST be signed off with a `Signed-off-by: Name <email>`
trailer. This certifies you wrote the code (or have the right to
submit it) under the project's MIT license — the [DCO](https://developercertificate.org)
text. The DCO bot enforces this on every PR.

The easiest way: use `git commit -s` to auto-append the trailer.

```sh
git commit -s -m "feat(api): add retry helper"
# →  Signed-off-by: Your Name <you@example.com>
```

If you forgot, amend:

```sh
git commit --amend --signoff && git push --force-with-lease
```

A failing `dco` status check means a commit is missing the trailer.
Fix by rebasing and adding `-s`:

```sh
git rebase HEAD~N --signoff
```

(Where `N` = the number of commits in your PR.)

## What we do NOT accept

- **PRs that scrape platforms prohibiting automated access** (LinkedIn, etc.). We actively reject these to respect third-party ToS.
- **PRs that enable auto-submitting applications** without human review. Heron is a decision-support tool, not a spam bot.
- **PRs that add external API dependencies** without prior discussion in an issue.
- **PRs containing personal data** (real CVs, emails, phone numbers). Use `docs/examples/` with fictional data instead.

## Development

```bash
# Test suites
pnpm test                     # Full Vitest matrix (unit + server + component + routes + integration)
pnpm test:coverage            # Coverage report (≥70% TS / ≥60% iOS gates)
pnpm test:ios                 # iOS XCTest + XCUITest (needs Mac + Xcode)
pnpm e2e                      # Playwright E2E (boots vite preview, installs Chromium first run)

# Quality gates
pnpm check                    # svelte-check + tsgo (typecheck), turbo-cached
pnpm format                   # biome + prettier-svelte, in-place
pnpm --filter ui size         # Bundle-size budget check (size-limit gates 80/30/700 KB)
pnpm --filter ui run lint     # oxlint

# Visual regression (Lost Pixel — self-hosted, baselines committed)
pnpm visual:baseline          # Generate baselines (first run + after legitimate UI changes)
pnpm visual:diff              # Compare current vs baseline; fails on >10% pixel diff
pnpm visual:diff --open       # Open .lostpixel/difference/ in Finder on diff (macOS)

# Brand + GH config (single source of truth)
pnpm brand:apply              # Propagate branding/brand.json → 30+ files
pnpm gh:verify                # Diff live GitHub state vs brand.json + .github/rulesets/
pnpm gh:apply                 # Reconcile (needs `gh auth status` + admin scope)

# Setup
pnpm run doctor               # Setup validation
pnpm dev                      # SvelteKit dev server (vite + HMR)
node cv-sync-check.mjs        # Config check
```

Pre-commit hooks (lefthook, wired by `pnpm install`): biome-format, svelte-check, no-secrets regex, apply-brand. Pre-push: full Vitest matrix (coverage gates ≥70% TS / ≥60% iOS).

### Branding (single source of truth)

`branding/brand.json` + `branding/logo.svg` are the only files you edit to rebrand. Every consumer (package.json × 3, capacitor configs, electron-builder, Info.plist, Brand.swift × 4, brand.ts × 2, manifest.webmanifest, favicon, app icons, fastlane Appfile + Fastfile) is regenerated by `pnpm brand:apply`. Pre-commit re-runs this when anything under `branding/` is staged.

### Releases (Conventional Commits → release-please → native-release)

| Commit prefix | Bump | Example |
|---|---|---|
| `feat: …` | minor | `feat(scan): add Workable adapter` |
| `fix: …` | patch | `fix(auth): reject same-site=none in WebView` |
| `perf: …` | patch | `perf: cache /api/stats response` |
| `feat!: …` / `BREAKING CHANGE:` | major | `feat!: drop adapter-auto` |
| `chore:` / `docs:` / `refactor:` / `ci:` | none | `chore(deps): bump electron 39 → 39.8.10` |

1. Merge PR to `main` (squash, one Conventional commit).
2. release-please accumulates commits into a release PR.
3. Merge release PR → tag + CHANGELOG + GitHub Release.
4. Tag push fires `native-release.yml`: **preflight** (secrets) → **desktop × 3 OS** → **iOS via fastlane**.

### Running CI locally

[`act`](https://github.com/nektos/act) runs GitHub Actions workflows on
your machine via Docker — useful for iterating on a workflow change
without 5-minute push-and-wait cycles. The repo ships per-workflow
shortcuts:

```bash
pnpm act:list                 # Show every job act would execute
pnpm act:test                 # Run .github/workflows/test.yml
pnpm act:test:dry             # Dry-run (just enumerate steps)
pnpm act:codeql               # Run the CodeQL workflow
pnpm act:dependency-review    # PR-time dependency review check
pnpm act:labeler              # PR auto-labeler
pnpm act:sbom                 # SBOM + attestations workflow
```

First run downloads ~3GB of Ubuntu runner images. Subsequent runs are
fast. `act` doesn't have macOS runners, so the `ios` job is skipped
locally — push to a PR branch to exercise it.

## Brand and Trademark

Contributions to the codebase are governed by the MIT [LICENSE](../LICENSE).
The "heron" name itself is governed by [TRADEMARK.md](../docs/TRADEMARK.md).
If you fork the project for commercial use, you're welcome to do so
under MIT — please give it your own product name and follow the
trademark policy regarding commercial naming and endorsement claims.

## Getting help

Heron is an open source project maintained in limited time. Here's
how to get help efficiently.

### Where to ask

| Question type | Where |
|---|---|
| **Bug** (something is broken) | [GitHub Issues](https://github.com/kaelys-js/heron/issues) — use the Bug Report template |
| **Feature idea** | [GitHub Issues](https://github.com/kaelys-js/heron/issues) — use the Feature Request template |
| **How do I…?** | [GitHub Discussions](https://github.com/kaelys-js/heron/discussions) or [Discord](https://discord.gg/8pRpHETxa4) |
| **Setup help** | Check [`docs/SETUP.md`](../docs/SETUP.md) first, then ask in [Discord](https://discord.gg/8pRpHETxa4) |
| **Security vulnerability** | Email <hello@heron.app> — see [`SECURITY.md`](SECURITY.md) |

### Before opening an issue

1. Search existing issues — someone may have reported it already.
2. Run `pnpm run doctor` — it catches most setup problems.
3. Include your OS, Node.js version, and the CLI you're using
   (Claude Code, Gemini, Codex, OpenCode, etc.).

### What NOT to use GitHub Issues for

- General questions about job searching
- Requests for personal career advice
- Support for modified forks or unofficial distributions
- Asking the maintainer to review your CV

These will be closed and redirected to the appropriate channel.

### Reference links

- [Architecture docs](../docs/ARCHITECTURE.md)
- [Setup guide](../docs/SETUP.md)
- [Discord community](https://discord.gg/8pRpHETxa4)
