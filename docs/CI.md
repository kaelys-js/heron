# CI gates and ruleset model

<!-- AUTO-GENERATED:doc-meta -->
*Part of the [Heron](../README.md) docs.*
<!-- /AUTO-GENERATED:doc-meta -->

How `kaelys-js/heron` keeps `main` clean. This document is the single
reference for **every gate** (pre-commit / pre-push / required CI check
/ ruleset rule) and **how to bypass each one** when you must.

## Layered defence

| Layer | When it runs | What it catches | Bypass |
|---|---|---|---|
| **lefthook `pre-commit`** | local `git commit` | format drift, secret patterns, syntax errors, formatter output | `SKIP_LEFTHOOK=1 git commit ...` |
| **lefthook `commit-msg`** | local `git commit` | Conventional Commits subject + DCO sign-off trailer | `SKIP_LEFTHOOK=1 git commit ...` |
| **lefthook `pre-push`** | local `git push` | typecheck, vitest, format-check, strict swiftlint/ruff/ktlint, actionlint+shellcheck, content gates (size/path/extensions/per-commit), release-readiness, PR-title budget | `SKIP_LEFTHOOK=1 git push` |
| **GitHub status checks** | every PR push | full Vitest matrix, iOS XCTest, CodeQL, OSSF Scorecard, Dependency Review, zizmor, secret scan, DCO, content gates (PR-level), PR quality | label `oversize-ok` / `no-issue` for specific opt-outs |
| **Ruleset `Protect main branch`** | on `git push origin main` | block force-push, deletion, unsigned commits, missing required-checks, low review count | admin `RepositoryRole 5` bypass |
| **Ruleset `Protect release tags`** | on `git push origin v*` | block tag deletion, force-update, unsigned tags | admin bypass |

## Required status checks on `main`

The ruleset at `.github/rulesets/main.json` enforces the following
contexts. PRs cannot merge until each goes green.

| Context | Source workflow | What it gates |
|---|---|---|
| `Tests / TS -- typecheck + Vitest + coverage` | `test.yml` | svelte-check + tsgo + Vitest matrix (unit/server/component/route/integration) + 70% coverage floor |
| `Tests / iOS -- XCTest + XCUITest + Snapshot` | `test.yml` | Fastlane test_ci on iPhone 17 Pro Max sim + xcov 60% floor |
| `Tests / Lint + format (Python / Go / Kotlin / Shell / Ruby / YAML)` | `test.yml` | actionlint+shellcheck, ruff, ktlint, shfmt, rufo, yamllint, taplo, dotenv-linter, plist + XML validators |
| `CodeQL Analysis / Analyze (javascript-typescript)` | `codeql.yml` | static analysis for JS/TS |
| `CodeQL Analysis / Analyze (python)` | `codeql.yml` | static analysis for Python |
| `CodeQL Analysis / Analyze (swift)` | `codeql.yml` | static analysis for Swift |
| `Dependency Review / dependency-review` | `dependency-review.yml` | block PRs that add deps with HIGH+ CVEs or copyleft licenses |
| `OSSF Scorecard / Scorecard analysis` | `scorecard.yml` | weekly Scorecard health score |
| `zizmor -- workflow security scan / Scan workflows` | `zizmor.yml` | workflow-injection + permission scan |
| `PR quality / Conventional Commits PR title` | `pr-quality.yml` | PR title matches Conventional Commits |
| **`PR content gates / Per-commit Conventional Commits`** | `pr-content-gates.yml` | every commit (not just title) matches Conventional Commits |
| **`PR content gates / File size <= 5MB`** | `pr-content-gates.yml` | block any file > 5MB |
| **`PR content gates / Path length <= 255 chars`** | `pr-content-gates.yml` | block any path > 255 chars (NTFS limit) |
| **`PR content gates / File extensions allowlist`** | `pr-content-gates.yml` | block `exe/dll/so/dylib/p8/p12/jks/keystore/pfx/der/crt/cer` |
| `DCO` | github.com/apps/dco | every commit has `Signed-off-by:` trailer |

**Bold rows** are the 4 gates added in audit cycle 4 to replace the
Enterprise-only ruleset rules (`commit_message_pattern`, `max_file_size`,
`max_file_path_length`, `file_extension_restriction`) that aren't
available on personal-account Free + public repos.

## Why the 4 replacement gates exist

GitHub's ruleset API supports these rule types only on Enterprise (for
the `*_pattern` family) or Team-plus-org-owned-private (for push-target
rules):

| Rule type | Real availability |
|---|---|
| `commit_message_pattern` | Enterprise Cloud only |
| `commit_author_email_pattern` | Enterprise Cloud only |
| `committer_email_pattern` | Enterprise Cloud only |
| `branch_name_pattern` | Enterprise Cloud only |
| `tag_name_pattern` | Enterprise Cloud only |
| `max_file_size` | Team plan + org-owned + private/internal |
| `max_file_path_length` | Team plan + org-owned + private/internal |
| `file_extension_restriction` | Team plan + org-owned + private/internal |
| `file_path_restriction` | Team plan + org-owned + private/internal |

Source: empirical 422 responses from the live API on this repo + the
`docs.github.com` ruleset reference. See also commit history of
`.github/rulesets/main.json` for the rollback (PR #70).

The replacement CI gates give the same guarantee -- a PR cannot merge
to `main` without satisfying each -- without depending on any plan tier.

## Pre-push parity

Every CI gate that's fast (< 2s) and deterministic is mirrored as a
lefthook pre-push hook so contributors see the failure locally before
a remote round-trip:

| CI gate | Pre-push hook | Notes |
|---|---|---|
| TS typecheck | `typecheck` | turbo-cached; warm < 100ms |
| Vitest | `vitest` | full matrix; warm < 100ms |
| biome / prettier | `format-check` | auto-recovers on drift |
| swiftlint --strict | `swiftlint-strict` | iOS only |
| ktlint | `ktlint-strict` | Android only |
| ruff | `ruff-strict` | Python |
| actionlint + shellcheck | `actionlint` | `-shellcheck=shellcheck` explicit |
| Per-commit Conventional Commits | `per-commit-conventional` | rev-list since `origin/main` |
| File size <= 5MB | `file-size-gate` | diff since `origin/main` |
| Path length <= 255 chars | `path-length-gate` | diff since `origin/main` |
| File extensions allowlist | `file-extensions-gate` | diff since `origin/main` |
| PR title <= 72 chars | `pr-title-budget` | requires existing PR; skips first push |
| Release readiness | `release-readiness` | only fires on tag push |

Bypass any of these for the rare emergency: `SKIP_LEFTHOOK=1 git push`.
Don't make a habit of it -- CI re-runs everything anyway, you're just
delaying the inevitable.

## Bypass labels (CI-only opt-outs)

Some CI checks accept labels as an opt-out:

| Label | What it bypasses |
|---|---|
| `oversize-ok` | `PR quality / Max PR size` (2000 LOC budget) |
| `no-issue` | `PR quality / feat PRs must link an issue` |

Use labels sparingly -- they're for cases like "Renovate lockfile bump
crosses 2000 LOC by design" or "this is a hotfix that needs to ship
before the issue is filed."

## Admin bypass

The bypass actor `RepositoryRole 5` (Admin) with `bypass_mode: always`
on both rulesets lets you `gh pr merge --admin` to override required
checks. Use case: emergency rollback when CI itself is broken.

Never use admin-merge to skip a check that's failing on its own
merits -- fix the underlying issue.

## Local development

```sh
# One-time setup
mise install         # installs Node + pnpm + Ruby + Python + every linter
pnpm install         # also runs `lefthook install` to wire git hooks

# Daily commands
pnpm dev             # turbo dev server
pnpm test            # full Vitest matrix
pnpm check           # svelte-check + tsgo
pnpm format          # biome write
pnpm format:check    # biome check (CI mirror)

# Manual hook invocation
lefthook run pre-commit
lefthook run pre-push --commands vitest
lefthook run pre-push --commands per-commit-conventional
```

## Adding a new required check

1. Add the workflow + job in `.github/workflows/<workflow>.yml`.
2. Add the context string to `required_status_checks` in
   `.github/rulesets/main.json`.
3. Apply the ruleset live: commit + push to `main` (the `maintain-config.yml`
   workflow auto-applies on changes under `.github/rulesets/**`), or trigger
   it manually (Actions → "Maintain GitHub config" → Run workflow → mode=apply).
4. Optionally add a pre-push mirror in `lefthook.yml`.
5. Update this document.

The `verify-required-checks.yml` workflow asserts every context string
in `main.json` matches an actual workflow job -- so a typo'd context
fails CI on PR-time.
