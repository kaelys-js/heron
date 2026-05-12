#!/usr/bin/env node
/**
 * ensure-pnpm.mjs — refuse non-pnpm package managers.
 *
 * Wired in as the root `preinstall` script. When `npm install`, `yarn`,
 * `bun install`, etc. start, npm runs preinstall — we inspect the user-agent
 * the package manager exposes (`npm_config_user_agent`) and refuse with a
 * helpful message if it isn't pnpm.
 *
 * Why this matters here:
 *   • The repo ships `pnpm-workspace.yaml` and uses pnpm's hoisting rules.
 *     npm/yarn would silently produce a different node_modules layout,
 *     leading to "module not found" errors that are hard to debug.
 *   • Lockfiles diverge: `package-lock.json` / `yarn.lock` / `bun.lockb`
 *     would conflict with `pnpm-lock.yaml`.
 *   • Hooks installed via `lefthook install` are pnpm-scripted; npm's
 *     `prepare` lifecycle is subtly different.
 *
 * Set `ALLOW_NON_PNPM=1` to bypass (for emergencies / CI experiments).
 */

if (process.env.ALLOW_NON_PNPM === '1') {
  process.exit(0);
}

const ua = process.env.npm_config_user_agent || '';
const tool = ua.split('/')[0]; // 'pnpm' | 'npm' | 'yarn' | 'bun' | …

// pnpm is the only allowed tool. Empty UA usually means direct invocation
// (e.g. `node scripts/ensure-pnpm.mjs`) — we allow that.
if (!tool || tool === 'pnpm') {
  process.exit(0);
}

const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';

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
