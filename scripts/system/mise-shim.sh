#!/usr/bin/env bash
# mise-shim.sh -- auto-route any command through mise's resolved tools.
#
# Goal: contributors should NEVER have to think about Node version,
# even when their shell PATH points at a wrong/stale install. Every
# script that needs Node goes through this shim, which:
#
#   1. Checks if Node on PATH matches the engines-pinned version.
#      If yes → fall through and exec the command directly (zero cost).
#   2. If no, AND mise is installed AND has the pinned version →
#      re-exec under `mise exec` so the command runs with the
#      correct toolchain. User sees nothing; their broken PATH is
#      silently routed around.
#   3. If no, AND mise isn't usable → fall through and let pnpm's
#      built-in engine warning fire. Better than silently swallowing
#      the error.
#
# Wired into:
#   - lefthook.yml pre-push commands (typecheck, vitest, format-check)
#   - root package.json scripts that fan out into turbo / vitest
#
# Why a shell script vs a Node script: shell sidesteps the chicken-and-
# egg ("Node is broken, can't run Node to fix Node"). Pure POSIX so it
# works on macOS + Linux runners + git-bash on Windows.
#
# Usage:
#   bash scripts/system/mise-shim.sh <command> [args…]
# or (more common, via package.json script):
#   "test": "bash scripts/system/mise-shim.sh turbo test"
set -euo pipefail

# Already inside an auto-shim re-exec? Don't loop.
if [ "${HERON_MISE_SHIM_ACTIVE:-0}" = "1" ]; then
  exec "$@"
fi

# Find the engines-pinned Node version. Single source of truth is
# root package.json::engines.node -- same value the preinstall guard
# (ensure-pnpm.mjs) checks. Pinned to an EXACT version (e.g. "26.1.0").
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PKG_JSON="$REPO_ROOT/package.json"

# Use Node to parse package.json IF Node is available -- falls through
# gracefully if even Node can't run (extremely cold environment).
# `node -p` is faster than node -e for one-liners.
if command -v node >/dev/null 2>&1; then
  EXPECTED=$(node -p "JSON.parse(require('fs').readFileSync('$PKG_JSON','utf8')).engines.node" 2>/dev/null || echo "")
  ACTUAL=$(node --version 2>/dev/null | sed 's/^v//' || echo "")
else
  EXPECTED=""
  ACTUAL=""
fi

# If we don't know the expected version OR the actual matches it
# already, fall through immediately. Hot path is zero-cost.
if [ -z "$EXPECTED" ] || [ "$EXPECTED" = "$ACTUAL" ]; then
  exec "$@"
fi

# Mismatch. Try mise.
if ! command -v mise >/dev/null 2>&1; then
  # No mise -- fall through. The user will see pnpm's engine warning,
  # which is the documented hand-fix path (install mise + run
  # `mise install`). We don't want to add a NEW error message on top
  # of that -- just let the existing flow surface.
  exec "$@"
fi

# Mise is installed. Verify the pinned version is installed.
if ! mise where "node@$EXPECTED" >/dev/null 2>&1; then
  # Mise installed but the pinned version isn't. Surface a one-liner
  # then fall through (so the command still runs, even if on wrong
  # Node -- the engine warning will then fire and pnpm shows what's
  # off).
  printf '\033[33m↻\033[0m Node v%s on PATH but repo wants v%s. Install via: \033[36mmise install\033[0m\n' "$ACTUAL" "$EXPECTED" >&2
  exec "$@"
fi

# Auto-route through mise. Set the loop guard so we don't recurse
# if the spawned process happens to re-invoke this shim.
#
# IMPORTANT: `mise exec node@X -- <cmd>` only resolves the literal
# `<cmd>` token through mise's PATH. If <cmd> is a SHELL invocation
# (sh -c '...', bash -c '...'), the inner shell inherits the OUTER
# PATH which still has the wrong Node first → npm, node-gyp, and any
# subprocess spawned from inside `<cmd>` resolve to the wrong Node.
# We hit this exact issue with `mise exec node@26.1.0 -- sh -c
# 'node-gyp rebuild'` silently invoking Node 25 inside node-gyp.
#
# Correct fix: PREPEND mise's bin dir to PATH ourselves, then `exec`
# the command. Every spawned subprocess inherits PATH and resolves
# `node` / `npm` / `pnpm` to mise's pinned version. Equivalent to
# what `mise activate` does for a login shell -- but scoped to this
# single command tree without polluting the parent shell.
NODE_BIN_DIR="$(mise where "node@$EXPECTED" 2>/dev/null)/bin"
if [ ! -d "$NODE_BIN_DIR" ]; then
  # Defensive: mise reported the version is installed but the bin dir
  # is missing. Fall through with a warning rather than break the user.
  printf '\033[33m↻\033[0m mise has node@%s but %s is missing — falling through\n' "$EXPECTED" "$NODE_BIN_DIR" >&2
  exec "$@"
fi
export HERON_MISE_SHIM_ACTIVE=1
export PATH="$NODE_BIN_DIR:$PATH"

# NODE_OPTIONS -- suppress known-third-party warnings so they don't
# pollute output. Node 22+ allows --disable-warning in NODE_OPTIONS.
# The OUTER vitest CLI fires DEP0205 (module.register deprecation
# from tsx/vitest/vite) BEFORE my vitest.config.ts execArgv applies
# to spawned workers -- setting it here means the outer process and
# every subprocess inherit the suppression.
#
#   --enable-source-maps:        better stack traces (mirrors .mise.toml)
#   --disable-warning=DEP0205:   tsx/vitest/vite still call module.register()
#                                 (TODO: remove when upstream migrates)
#   --disable-warning=ExperimentalWarning:
#                                 webstorage stub probe in jsdom + the
#                                 polyfill we install in test-setup.ts
#
# Do NOT set --localstorage-file here -- it needs a real per-run path
# which vitest.config.ts assembles into the worker execArgv.
# Do NOT set --throw-deprecation here either -- it'd convert third-
# party deprecations into errors at process load before our
# --disable-warning kicks in (order is parse-then-apply). The
# vitest.config.ts worker execArgv already adds it scoped to workers
# where our `--disable-warning=DEP0205` lands first.
export NODE_OPTIONS="${NODE_OPTIONS:-} --enable-source-maps --disable-warning=DEP0205 --disable-warning=ExperimentalWarning"

exec "$@"
