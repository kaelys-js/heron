#!/usr/bin/env node
/**
 * dev-ios — one-shot: start the dev server, sync iOS, open Xcode.
 *
 * After this script exits, Xcode has the project open and you just
 * press Cmd+R to run on a simulator or device. The dev server stays
 * running so the iOS app finds it via localhost (sim) or Bonjour LAN
 * (real device on same wifi).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { step, run, which, ok, warn, info, UI, ROOT } from './_lib.mjs';

step(1, 'Preflight');
if (!which('pnpm')) {
  console.error('pnpm not found');
  process.exit(1);
}
if (!which('pod')) {
  warn('CocoaPods not found — install with: brew install cocoapods');
  warn('Continuing without pod install — Xcode build may fail on first attempt.');
}
if (!which('xcodebuild')) {
  console.error('Xcode CLI tools not found — install Xcode from the App Store');
  process.exit(1);
}

const iosDir = join(UI, 'ios', 'App');
if (!existsSync(iosDir)) {
  console.error('ios/App not found. Run `pnpm exec cap add ios` first.');
  process.exit(1);
}

step(2, 'Applying brand (idempotent — propagates branding/brand.json)');
run('node', [join(ROOT, 'scripts/native/apply-brand.mjs')], { silent: true });

step(3, 'Building static shell for Capacitor');
run('pnpm', ['build'], {
  cwd: UI,
  env: { CAPACITOR: '1', PUBLIC_CAPACITOR_BUILD: '1' },
});

step(4, 'Syncing iOS project');
run('pnpm', ['exec', 'cap', 'sync', 'ios'], { cwd: UI });

step(5, 'Installing Cocoapods');
if (which('pod')) {
  run('pod', ['install', '--silent'], { cwd: iosDir, allowFail: true });
  ok('pods installed');
} else {
  warn('skipped — pod not on PATH');
}

step(6, 'Starting Vite dev server in background');
const dev = spawn('pnpm', ['dev'], {
  cwd: UI,
  stdio: 'inherit',
  env: process.env,
  detached: false,
});
ok(`vite dev started (pid ${dev.pid}) — listening on localhost:5173`);

step(7, 'Opening Xcode');
const workspace = join(iosDir, 'App.xcworkspace');
run('open', [workspace], { allowFail: true });
ok('Xcode opened — press ⌘R to run');

info('');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
info('iOS simulator finds localhost:5173 automatically.');
info('Real device on same wifi finds your Mac via Bonjour.');
info('Press Ctrl+C in this terminal to stop the dev server.');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Relay Ctrl+C to the dev server.
process.on('SIGINT', () => {
  dev.kill('SIGTERM');
  process.exit(0);
});
// Wait on the dev server.
await new Promise((resolve) => dev.on('exit', resolve));
