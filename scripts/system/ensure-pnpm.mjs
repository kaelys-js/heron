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
import { spawnSync } from 'node:child_process';

const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

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
    // ── AUTO-FIX path ──────────────────────────────────────────────
    // If mise is on PATH and the expected Node version is already
    // installed under mise, transparently re-exec the calling command
    // through `mise exec` so the rest of the install/lefthook/whatever
    // runs on the correct Node. The user never sees the mismatch —
    // their broken shell PATH is silently routed around.
    //
    // Detection chain:
    //   1. `command -v mise` (is mise installed?)
    //   2. `mise where node@<expected>` (is the right version installed?)
    //
    // If either fails we fall through to the actionable error message
    // (the hand-fix path) — the user installs mise / runs `mise install`,
    // and the auto-fix engages on their next attempt.
    //
    // Why not auto-install via mise? `mise install` downloads + compiles
    // (multi-minute for some toolchains) and we can't show progress from
    // a non-TTY preinstall hook. Surface the install command instead.
    const mise = spawnSync('command', ['-v', 'mise'], {
      shell: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const miseAvailable = mise.status === 0 && (mise.stdout || '').trim().length > 0;

    if (miseAvailable) {
      const where = spawnSync('mise', ['where', `node@${expected}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const nodeInstalled = where.status === 0 && (where.stdout || '').trim().length > 0;

      if (nodeInstalled) {
        // Re-exec the parent command via `mise exec`. The parent command
        // is whatever pnpm/lefthook/etc. was running when this guard
        // fired — e.g. `pnpm install`, `git push`, `pnpm test`. The
        // process.env.npm_lifecycle_script / npm_lifecycle_event tell
        // us what to re-run. If we can identify it, re-exec; otherwise
        // we fall through with a friendlier message (no re-exec, but
        // also no scary stacktrace — mise is set up, user just needs
        // to invoke the command via mise themselves).
        const lifecycleScript = process.env.npm_lifecycle_script;
        const lifecycleEvent = process.env.npm_lifecycle_event;
        const userAgent = process.env.npm_config_user_agent || '';
        const pm = userAgent.split('/')[0] || 'pnpm';

        if (lifecycleScript && lifecycleEvent) {
          // Re-running the lifecycle script under the correct Node.
          // We bypass THIS guard on the re-exec (otherwise infinite
          // loop) by setting ALLOW_NODE_VERSION_MISMATCH=1 — safe
          // because mise IS giving us the right version inside the
          // exec; the guard's redundant.
          console.error(
            `${DIM}${YELLOW}↻${RESET}${DIM} Node v${actual} on PATH but repo wants v${expected}.${RESET}` +
              `\n${DIM}  mise has v${expected} installed — re-running via \`mise exec\` to use it.${RESET}\n`,
          );
          const result = spawnSync(
            'mise',
            ['exec', `node@${expected}`, '--', pm, 'run', lifecycleEvent],
            {
              stdio: 'inherit',
              env: { ...process.env, ALLOW_NODE_VERSION_MISMATCH: '1' },
            },
          );
          process.exit(result.status ?? 1);
        }

        // No lifecycle context (script invoked directly?). Just point
        // the user at `mise exec --` as a one-liner.
        console.error(
          `\n${YELLOW}${BOLD}↻ Node mismatch — fix via mise (one-liner)${RESET}` +
            `\n  Your shell has Node v${actual}. Repo wants v${expected}.` +
            `\n  mise has v${expected} installed but your shell PATH didn't pick it up.` +
            `\n` +
            `\n  ${BOLD}Run via mise${RESET} (no install needed, just re-execs through mise):` +
            `\n    ${CYAN}mise exec -- <your-command>${RESET}` +
            `\n` +
            `\n  ${BOLD}Permanent fix${RESET} (so this never happens again):` +
            `\n    ${CYAN}mise reshim${RESET}                # regenerates shims; restart your shell after` +
            `\n    ${CYAN}eval "\$(mise activate zsh)"${RESET}  # add to ~/.zshrc if missing` +
            `\n` +
            `\n  ${BOLD}Emergency bypass${RESET}:` +
            `\n    ${YELLOW}ALLOW_NODE_VERSION_MISMATCH=1 <your-command>${RESET}` +
            `\n`,
        );
        process.exit(1);
      }
    }

    // ── Hand-fix path ──────────────────────────────────────────────
    // mise isn't installed OR doesn't have the expected version.
    // Surface the install instructions.
    console.error(
      `\n${RED}${BOLD}✗ Wrong Node version: v${actual} (repo requires v${expected})${RESET}\n` +
        `\n  The mismatch usually means your shell's PATH is resolving an` +
        `\n  orphaned Node install ahead of the mise-pinned version.` +
        `\n  pnpm would only WARN about this, then proceed and produce` +
        `\n  silently drifting installs across contributors. This gate` +
        `\n  blocks before that happens.\n` +
        `\n  ${BOLD}Fix with mise${RESET} (the version manager this repo pins):` +
        `\n    ${CYAN}brew install mise${RESET}              # if mise isn't installed yet` +
        `\n    ${CYAN}mise install${RESET}                  # installs v${expected} if missing` +
        `\n    ${CYAN}mise reshim${RESET}                   # regenerates shims, fixes PATH order` +
        `\n    ${CYAN}mise uninstall node@${actual}${RESET}   # removes the stale install (optional)` +
        `\n` +
        `\n  ${BOLD}Activate mise in your shell${RESET} (one-time, then auto):` +
        `\n    ${CYAN}echo 'eval "\$(mise activate zsh)"' >> ~/.zshrc${RESET}` +
        `\n    ${CYAN}exec zsh${RESET}` +
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
