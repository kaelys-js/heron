#!/usr/bin/env bash
# verify-merge-markers.sh -- fail if any tracked file has leftover Git
# conflict markers at line start. `git grep` exits 0 when it finds a match,
# so a match means FAIL. Test/spec files are excluded (they assert on marker
# handling). The trailing space avoids matching e.g. a bare `<<<<<<<` in code.
# Wrapped by the `//#verify:merge-markers` Turbo task (repo-wide input by
# design -- a marker can appear anywhere).
set -euo pipefail
cd "$(dirname "$0")/../.."

if git grep -lInE '^(<{7}|>{7}|={7}) ' -- ':!**/*.test.*' ':!**/*.spec.*' >/dev/null 2>&1; then
  echo "✗ leftover Git merge-conflict markers:"
  git grep -lInE '^(<{7}|>{7}|={7}) ' -- ':!**/*.test.*' ':!**/*.spec.*'
  exit 1
fi
echo "✓ no leftover merge-conflict markers"
