#!/usr/bin/env bash
# verify-gates.sh -- every whole-repo "gate" verifier, run as ONE blocking
# unit. Wrapped by the `//#verify:gates` Turbo task (see turbo.json) so it
# is content-hash cached: unchanged inputs -> replayed, skipped. All three
# enforcement layers (pre-commit, pre-push, CI) run this same script via
# `turbo run verify:gates`, which is how they stay at 100% parity.
#
# These are pure-Node (or bundled-npm-tool) scanners that always run on any
# machine -- no `command -v` guard, so a missing one is a HARD failure, not
# a silent skip. Tool-gated linters (swiftlint/ktlint/ruff/...) live in
# lint-native.sh instead.
set -euo pipefail
cd "$(dirname "$0")/../.."

run() {
  echo "▸ $1"
  shift
  "$@"
}

run "no-slop" node scripts/system/verify-no-slop.mjs
run "comment-style" node scripts/system/verify-comment-style.mjs
run "english-only" node scripts/system/verify-english-only.mjs
run "modes-correctness" node scripts/system/verify-modes.mjs
run "exact-versions" node scripts/system/validate-exact-versions.mjs
run "version-sync" node scripts/system/validate-version-sync.mjs
run "format-config-sync" node scripts/system/validate-format-config-sync.mjs
run "json-schemas" node scripts/system/validate-json-schemas.mjs
run "lockfile-integrity" node scripts/system/validate-pnpm-lockfile.mjs
run "pnpm-scripts" node scripts/system/verify-pnpm-scripts.mjs
run "csp-hashes" node scripts/system/verify-csp-hashes.mjs
run "tiny-configs" node scripts/system/validate-tiny-configs.mjs
run "fonts" node scripts/system/verify-fonts.mjs
run "workflow-quality" node scripts/system/verify-workflow-quality.mjs
run "markdownlint" pnpm exec markdownlint-cli2
run "xml" bash scripts/system/validate-xml.sh

# Leftover Git conflict markers at line start. `git grep` exits 0 when it
# finds a match, so a match means FAIL. Exclude test files (they assert on
# marker handling). The trailing space avoids matching e.g. `<<<<<<<` in code.
echo "▸ merge-markers"
if git grep -lInE '^(<{7}|>{7}|={7}) ' -- ':!**/*.test.*' ':!**/*.spec.*' >/dev/null 2>&1; then
  echo "✗ leftover Git merge-conflict markers:"
  git grep -lInE '^(<{7}|>{7}|={7}) ' -- ':!**/*.test.*' ':!**/*.spec.*'
  exit 1
fi

echo "✓ verify-gates: all whole-repo gates passed"
