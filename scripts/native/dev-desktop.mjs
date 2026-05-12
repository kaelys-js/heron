#!/usr/bin/env node
/**
 * dev-desktop — one-shot: spin up the dev server AND the Electron window.
 *
 * Equivalent to running two terminals:
 *   Terminal 1: cd ui && pnpm dev
 *   Terminal 2: cd ui/electron && npm run electron:start-live
 *
 * Hot reload of Svelte components works inside the Electron WebView.
 * Ctrl+C kills both processes.
 */
import { step, run, runParallel, which, info, UI, ROOT } from './_lib.mjs';
import { join } from 'node:path';

step(1, 'Preflight');
if (!which('pnpm')) {
  console.error('pnpm not found on PATH — install with: npm i -g pnpm');
  process.exit(1);
}

step(2, 'Ensuring electron deps');
const electronDir = join(UI, 'electron');
run('npm', ['install', '--silent', '--no-audit', '--no-fund'], { cwd: electronDir, allowFail: true });

step(3, 'Launching SvelteKit dev server + Electron in parallel');
console.log('  ' + '─'.repeat(60));
console.log('  Press Ctrl+C to stop both.');
console.log('  ' + '─'.repeat(60) + '\n');

try {
  await runParallel([
    { cmd: 'pnpm', args: ['dev'], cwd: UI, label: 'vite dev' },
    { cmd: 'npm', args: ['run', 'electron:start-live'], cwd: electronDir, label: 'electron live' },
  ]);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
