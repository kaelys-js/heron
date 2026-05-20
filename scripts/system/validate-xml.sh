#!/usr/bin/env bash
# validate-xml.sh -- assert every XML-format file in the repo is well-formed.
#
# Covers:
#   - *.svg         -- vector graphics (branding/logo.svg, favicon.svg, etc.)
#   - *.storyboard  -- Apple Interface Builder XML (LaunchScreen, Main)
#
# NOT covered:
#   - *.plist / *.entitlements / *.xcprivacy -- Apple plists; XML-format but
#     have their own schema. Handled by scripts/system/validate-plists.py.
#   - *.pbxproj -- OpenStep ASCII plist, not XML. Handled by Xcode itself.
#   - *.xcconfig -- Apple build-setting text, not XML.
#
# Uses xmllint --noout (well-formedness check, no DTD/schema validation).
# xmllint ships with libxml2; pre-installed on every macOS and the
# `ubuntu-latest` GitHub Actions runner.
#
# Exit 0 if every file parses; exit 1 with a per-file error report.
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v xmllint >/dev/null 2>&1; then
  echo "skip: xmllint not on PATH (libxml2-utils)"
  exit 0
fi

# Find every *.svg + *.storyboard outside build / dep directories.
# Using git ls-files instead of find so untracked / gitignored artefacts
# (ui/build/, .svelte-kit/, etc.) are never even seen.
files=$(git ls-files '*.svg' '*.storyboard' 2>/dev/null || true)

if [ -z "$files" ]; then
  echo "(no XML files found)"
  exit 0
fi

failed=()
total=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  total=$((total + 1))
  if xmllint --noout "$f" 2>/dev/null; then
    echo "  ✓ $f"
  else
    echo "  ✗ $f"
    # Re-run to surface the error message
    xmllint --noout "$f" 2>&1 | head -3 | sed 's/^/      /'
    failed+=("$f")
  fi
done <<<"$files"

if [ ${#failed[@]} -gt 0 ]; then
  echo
  echo "× ${#failed[@]} XML file(s) failed to parse."
  exit 1
fi

echo
echo "✓ $total XML file(s) parsed cleanly"
