#!/usr/bin/env bash
# Shared logic for the 4 PR content gates, replacing the Enterprise-only
# ruleset rules we can't apply on this Free + public + personal-account repo.
# Invoked by both .github/workflows/pr-content-gates.yml (CI) and
# lefthook.yml (pre-push) so the same logic produces the same outcome
# everywhere -- no CI-vs-local drift.
#
# Usage:
#   check-content-gates.sh <gate> [<base-ref> [<head-ref>]]
#
# <gate> = per-commit-conventional | file-size | path-length | file-extensions | all
# <base-ref> defaults to merge-base with origin/main (pre-push mode)
#            or $BASE_SHA env var (CI mode, set from pull_request.base.sha)
# <head-ref> defaults to HEAD (pre-push) or $HEAD_SHA env var (CI)
#
# Exits 0 on pass, 1 on violations found. Each gate prints a human-readable
# table on failure (with $GITHUB_STEP_SUMMARY-friendly markdown when on CI).

set -euo pipefail

GATE="${1:-all}"
BASE="${2:-${BASE_SHA:-}}"
HEAD="${3:-${HEAD_SHA:-HEAD}}"

# Resolve BASE if not explicitly provided.
if [ -z "$BASE" ]; then
  BASE=$(git merge-base origin/main HEAD 2>/dev/null || true)
fi
if [ -z "$BASE" ] || [ "$BASE" = "$(git rev-parse "$HEAD" 2>/dev/null)" ]; then
  # No divergence -- nothing to check (e.g. first push from new branch when origin/main IS HEAD).
  exit 0
fi

# Detect environment for output format. CI sets GITHUB_STEP_SUMMARY.
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  SUMMARY="$GITHUB_STEP_SUMMARY"
else
  SUMMARY=/dev/stderr
fi

# ---- Gate 1: per-commit Conventional Commits ----------------------------
gate_per_commit_conventional() {
  # Pattern mirrors lefthook commit-msg hook + main.json's eventual
  # commit_message_pattern rule (when Enterprise unlocks it).
  PATTERN='^((Merge|Revert|fixup!|squash!|chore\(main\): release|chore\(deps\)|Bump)|(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(\([a-z0-9_-]+\))?!?: .{1,72})'
  FAILED=""
  while IFS= read -r sha; do
    [ -z "$sha" ] && continue
    subject=$(git log -1 --format=%s "$sha")
    if ! printf '%s' "$subject" | grep -qE "$PATTERN"; then
      FAILED+="| \`${sha:0:7}\` | ${subject} |"$'\n'
    fi
  done <<EOF
$(git rev-list --no-merges "${BASE}..${HEAD}")
EOF
  if [ -n "$FAILED" ]; then
    {
      echo "## ❌ Per-commit Conventional Commits"
      echo ""
      echo "The following commits don't match the Conventional Commits grammar:"
      echo ""
      echo "| SHA | Subject |"
      echo "|---|---|"
      printf '%s' "$FAILED"
      echo ""
      echo "**Fix:** \`git rebase -i ${BASE:0:7}\` and reword each non-conforming subject."
      echo "Each must match: \`<type>(<scope>)!: <subject>\` (72 chars max)."
      echo "Allowed types: feat fix chore docs style refactor perf test build ci revert"
    } >>"$SUMMARY"
    return 1
  fi
  return 0
}

# ---- Gate 2: file size <= 5MB ------------------------------------------
gate_file_size() {
  MAX_BYTES=5242880 # 5 * 1024 * 1024
  FAILED=""
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    [ -f "$path" ] || continue
    # stat -c (GNU) and stat -f (BSD/macOS) differ; try both.
    size=$(stat -c %s "$path" 2>/dev/null || stat -f %z "$path" 2>/dev/null || echo 0)
    if [ "$size" -gt "$MAX_BYTES" ]; then
      if [ "$size" -ge 1048576 ]; then
        hsize=$(awk "BEGIN{printf \"%.2f MB\", $size/1048576}")
      else
        hsize=$(awk "BEGIN{printf \"%.1f KB\", $size/1024}")
      fi
      FAILED+="| \`$path\` | $hsize |"$'\n'
    fi
  done <<EOF
$(git diff --diff-filter=AM --name-only "${BASE}..${HEAD}")
EOF
  if [ -n "$FAILED" ]; then
    {
      echo "## ❌ File size > 5MB"
      echo ""
      echo "| Path | Size |"
      echo "|---|--:|"
      printf '%s' "$FAILED"
      echo ""
      echo "**Fix:** use Git LFS for large binaries, or compress/relocate."
      echo "The 5MB cap exists to keep git history fast for fresh clones."
    } >>"$SUMMARY"
    return 1
  fi
  return 0
}

# ---- Gate 3: path length <= 255 chars ----------------------------------
gate_path_length() {
  MAX_LEN=255
  FAILED=""
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    len=${#path}
    if [ "$len" -gt "$MAX_LEN" ]; then
      FAILED+="| $len | \`$path\` |"$'\n'
    fi
  done <<EOF
$(git diff --diff-filter=AM --name-only "${BASE}..${HEAD}")
EOF
  if [ -n "$FAILED" ]; then
    {
      echo "## ❌ Path length > 255 chars"
      echo ""
      echo "| Length | Path |"
      echo "|---|---|"
      printf '%s' "$FAILED"
      echo ""
      echo "**Why:** Windows NTFS path limit. Cross-platform reproducibility."
      echo "**Fix:** rename to a shorter path."
    } >>"$SUMMARY"
    return 1
  fi
  return 0
}

# ---- Gate 4: file extensions allowlist ---------------------------------
gate_file_extensions() {
  # *.pem / *.key are NOT in this list -- they're caught by GitHub
  # secret-scanning push protection (free on public repos). Doubling up
  # would create a confusing "two errors for the same thing" experience.
  BLOCKED='\.(exe|dll|so|dylib|p8|p12|jks|keystore|pfx|der|crt|cer)$'
  FAILED=""
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    if printf '%s' "$path" | grep -qiE "$BLOCKED"; then
      FAILED+="| \`$path\` |"$'\n'
    fi
  done <<EOF
$(git diff --diff-filter=AM --name-only "${BASE}..${HEAD}")
EOF
  if [ -n "$FAILED" ]; then
    {
      echo "## ❌ Blocked file extension"
      echo ""
      echo "| Path |"
      echo "|---|"
      printf '%s' "$FAILED"
      echo ""
      echo "Blocked: \`exe dll so dylib p8 p12 jks keystore pfx der crt cer\`"
      echo ""
      echo "**Why:**"
      echo "  - Binary executables shouldn't live in repo (use releases / artifacts)"
      echo "  - Cryptographic key material shouldn't live in repo (use secret manager)"
      echo ""
      echo "**Note:** \`*.pem\` / \`*.key\` are blocked by GitHub secret-scanning"
      echo "push protection, not by this gate."
    } >>"$SUMMARY"
    return 1
  fi
  return 0
}

case "$GATE" in
  per-commit-conventional)
    gate_per_commit_conventional
    ;;
  file-size)
    gate_file_size
    ;;
  path-length)
    gate_path_length
    ;;
  file-extensions)
    gate_file_extensions
    ;;
  all)
    rc=0
    gate_per_commit_conventional || rc=1
    gate_file_size || rc=1
    gate_path_length || rc=1
    gate_file_extensions || rc=1
    exit "$rc"
    ;;
  *)
    echo "Unknown gate: $GATE" >&2
    echo "Usage: $0 {per-commit-conventional|file-size|path-length|file-extensions|all} [base] [head]" >&2
    exit 2
    ;;
esac
