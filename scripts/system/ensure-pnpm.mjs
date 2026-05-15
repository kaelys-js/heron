#!/usr/bin/env node
/**
 * ensure-pnpm.mjs — refuse non-pnpm package managers + wrong Node version.
 *
 * Wired in as the root `preinstall` script. Runs two gates:
 *
 *   1. Package-manager gate. Inspects `npm_config_user_agent` and refuses
 *      `npm install`, `yarn`, `bun install`, etc. with a helpful message.
 *      pnpm is the only allowed tool — the repo ships `pnpm-workspace.yaml`
 *      and pnpm's hoisting + lockfile layout. npm/yarn would silently
 *      produce a different `node_modules/`, leading to "module not found"
 *      errors that are hard to debug. Lefthook hooks installed via the
 *      `prepare` script also depend on pnpm's lifecycle.
 *
 *   2. Node-version gate. Compares `process.version` against the
 *      `engines.node` pin in root package.json. The repo pins exact node
 *      via mise (`.mise.toml`), and `engines.node` mirrors it. A common
 *      failure mode: a developer has multiple Node versions installed
 *      (orphaned mise installs, system Node, Homebrew Node) and their
 *      shell's PATH resolves a wrong one ahead of the mise-pinned one.
 *      pnpm only emits a warning in that case — silent drift between
 *      contributors. This gate makes it a hard install-time failure.
 *
 * Set `ALLOW_NON_PNPM=1` to bypass the package-manager gate.
 * Set `ALLOW_NODE_VERSION_MISMATCH=1` to bypass the node-version gate.
 * Both bypasses are for emergencies / CI experiments only.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

// ── Gate 1: package manager ─────────────────────────────────────────
if (process.env.ALLOW_NON_PNPM !== '1') {
  const ua = process.env.npm_config_user_agent || '';
  const tool = ua.split('/')[0]; // 'pnpm' | 'npm' | 'yarn' | 'bun' | …
  // Empty UA usually means direct invocation (`node scripts/system/ensure-pnpm.mjs`)
  // — allow that so devs can run this script standalone for debugging.
  if (tool && tool !== 'pnpm') {
    console.error(
      `\n${RED}${BOLD}✗ Wrong package manager: ${tool}${RESET}\n` +
        `\n  This repo uses ${CYAN}pnpm${RESET} exclusively.` +
        `\n  Lockfile (pnpm-lock.yaml), hoisting layout, and lefthook hooks` +
        `\n  depend on pnpm's specific behaviour. Using ${tool} will create` +
        `\n  a divergent install and break the dashboard.\n` +
        `\n  ${BOLD}Install pnpm${RESET} (one-time):` +
        `\n    npm i -g pnpm        # or: brew install pnpm` +
        `\n` +
        `\n  ${BOLD}Then in this repo${RESET}:` +
        `\n    pnpm install` +
        `\n` +
        `\n  ${BOLD}Emergency bypass${RESET} (you really shouldn't):` +
        `\n    ALLOW_NON_PNPM=1 ${tool} install` +
        `\n`,
    );
    process.exit(1);
  }
}

// ── Gate 2: node version ────────────────────────────────────────────
if (process.env.ALLOW_NODE_VERSION_MISMATCH !== '1') {
  // scripts/system/ensure-pnpm.mjs → scripts/system/ → scripts/ → repo root.
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let expected;
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    expected = pkg?.engines?.node;
  } catch {
    // package.json unreadable — non-fatal. Skip the gate rather than
    // block install on a malformed file (pnpm itself will fail later
    // with a clearer error).
  }
  const actual = process.version.replace(/^v/, '');
  if (expected && actual !== expected) {
    // The mise install path is the canonical fix. Other version managers
    // (asdf, nvm, fnm, volta) work but they're not what the repo
    // documents in .mise.toml — the message points at mise first.
    console.error(
      `\n${RED}${BOLD}✗ Wrong Node version: v${actual} (repo requires v${expected})${RESET}\n` +
        `\n  The mismatch usually means your shell's PATH is resolving an` +
        `\n  orphaned Node install ahead of the mise-pinned version.` +
        `\n  pnpm would only WARN about this, then proceed and produce` +
        `\n  silently drifting installs across contributors. This gate` +
        `\n  blocks before that happens.\n` +
        `\n  ${BOLD}Fix with mise${RESET} (the version manager this repo pins):` +
        `\n    ${CYAN}mise install${RESET}                  # installs v${expected} if missing` +
        `\n    ${CYAN}mise reshim${RESET}                   # regenerates shims, fixes PATH order` +
        `\n    ${CYAN}mise uninstall node@${actual}${RESET}   # removes the stale install (optional)` +
        `\n` +
        `\n  ${BOLD}Verify${RESET}:` +
        `\n    mise current        # should show 'node ${expected}'` +
        `\n    node --version      # should print v${expected}` +
        `\n` +
        `\n  ${BOLD}Emergency bypass${RESET} (CI experiments only):` +
        `\n    ${YELLOW}ALLOW_NODE_VERSION_MISMATCH=1 pnpm install${RESET}` +
        `\n`,
    );
    process.exit(1);
  }
}

process.exit(0);
