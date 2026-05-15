#!/usr/bin/env node
/**
 * clean.mjs — nuke build caches across the monorepo.
 *
 * Removes:
 *   • .turbo/                       (turbo task graph cache)
 *   • ui/.svelte-kit/               (svelte-kit generated)
 *   • ui/build/                     (adapter-node + adapter-static output)
 *   • ui/electron/build/            (electron tsgo output)
 *   • ui/electron/dist/             (electron-builder output)
 *   • ui/electron/app/              (capacitor-community/electron sync output)
 *   • scripts/native/icons/_build/  (icon generator cache)
 *
 * Does NOT remove:
 *   • node_modules/                 — use `pnpm dlx rimraf node_modules` if needed
 *   • data/                         — that's user data, never auto-deleted
 *   • reports/, output/             — user-generated artefacts
 *
 * Safe to re-run; missing dirs are skipped.
 */
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  '.turbo',
  'ui/.turbo',
  'ui/.svelte-kit',
  'ui/build',
  'ui/electron/build',
  'ui/electron/dist',
  'ui/electron/app',
  'ui/electron/.turbo',
  'scripts/native/icons/_build',
];

const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

for (const target of TARGETS) {
  const full = path.join(ROOT, target);
  if (existsSync(full)) {
    await rm(full, { recursive: true, force: true });
    console.log(`${GREEN}✓${RESET} removed ${target}`);
  } else {
    console.log(`${DIM}·${RESET} ${target} (already absent)`);
  }
}

console.log(`\n${GREEN}Done.${RESET} Run \`pnpm install\` to repopulate workspace symlinks.`);
