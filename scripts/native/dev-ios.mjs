#!/usr/bin/env node
/**
 * dev-ios — one-shot: build, sync, boot simulator, install, launch.
 *
 * What it actually does:
 *   1. Preflight — pnpm + xcode CLI present, ios/App exists
 *   2. Apply brand (idempotent — propagates branding/brand.json)
 *   3. Build the SvelteKit static shell (CAPACITOR=1)
 *   4. `cap sync ios` (copies static build into the iOS project)
 *   5. CocoaPods (only if Podfile exists — Capacitor 7+ uses SPM)
 *   6. Start Vite dev server on :5173 in the background
 *   7. Pick a target simulator (reuse booted iPhone, else boot newest)
 *   8. `cap run ios --target=<udid> --no-sync` — xcodebuild + install + launch
 *
 * The WebView in the simulator hits localhost:5173 so live-reload works
 * as you edit Svelte files. Real device on same wifi finds your Mac via
 * Bonjour (NSBonjourServices in Info.plist).
 *
 * If `cap run ios` fails (signing, missing simulator runtime, etc.) the
 * script falls back to `open App.xcodeproj` so you can debug in Xcode UI.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { step, run, capture, which, ok, warn, info, UI, ROOT } from './_lib.mjs';

const iosDir = join(UI, 'ios', 'App');

// Capacitor 7+ uses Swift Package Manager (Package.swift) by default,
// not CocoaPods. Detect which one this project uses so we install the
// right deps + open the right file. Capacitor writes `Package.swift`
// inside `ios/App/CapApp-SPM/`.
const usesPodfile = existsSync(join(iosDir, 'Podfile'));
const usesSPM = existsSync(join(iosDir, 'CapApp-SPM', 'Package.swift'));

step(1, 'Preflight');
if (!which('pnpm')) {
  console.error('pnpm not found');
  process.exit(1);
}
if (usesPodfile && !which('pod')) {
  warn('CocoaPods not found — install with: brew install cocoapods');
  warn('Continuing without pod install — Xcode build may fail on first attempt.');
}
if (!which('xcodebuild') || !which('xcrun')) {
  console.error('Xcode CLI tools not found — install Xcode from the App Store');
  process.exit(1);
}

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

if (usesPodfile) {
  step(5, 'Installing CocoaPods');
  if (which('pod')) {
    run('pod', ['install', '--silent'], { cwd: iosDir, allowFail: true });
    ok('pods installed');
  } else {
    warn('skipped — pod not on PATH');
  }
} else {
  step(5, 'Skipping CocoaPods (project uses Swift Package Manager)');
  info('Capacitor 7+ ships SPM by default. Xcode resolves deps automatically.');
}

step(6, 'Starting Vite dev server in background');
const dev = spawn('pnpm', ['dev'], {
  cwd: UI,
  stdio: 'inherit',
  env: process.env,
  detached: false,
});
ok(`vite dev started (pid ${dev.pid}) — waiting for it to bind :5173…`);

// Wait for Vite to actually accept connections on :5173 before launching
// the iOS app — otherwise the WebView's first request hits a closed port
// and the app shows a blank/error screen.
async function waitForPort(port, host = '127.0.0.1', timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const sock = createConnection({ port, host });
      const cleanup = (v) => {
        sock.removeAllListeners();
        try {
          sock.destroy();
        } catch {}
        resolve(v);
      };
      sock.once('connect', () => cleanup(true));
      sock.once('error', () => cleanup(false));
      setTimeout(() => cleanup(false), 500);
    });
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const viteReady = await waitForPort(5173);
if (viteReady) {
  ok('vite is serving on :5173');
} else {
  warn('Vite did not bind :5173 within 30s — continuing anyway (app may show blank).');
}

step(7, 'Picking iOS simulator target');
/** Reuse an already-booted iPhone if any; else boot the newest available. */
function pickSimulatorTarget() {
  // 1. Already-booted iPhone wins.
  try {
    const out = capture('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], {
      allowFail: true,
    });
    if (out) {
      const parsed = JSON.parse(out);
      for (const list of Object.values(parsed.devices || {})) {
        for (const d of list) {
          if (d.state === 'Booted' && /iPhone/i.test(d.name)) {
            ok(`reusing booted simulator: ${d.name}`);
            return d.udid;
          }
        }
      }
    }
  } catch (err) {
    warn(`could not parse booted simulator list: ${err.message}`);
  }

  // 2. Boot the newest available iPhone (highest model number, prefer Pro Max > Pro > Plus > base).
  try {
    const out = capture('xcrun', ['simctl', 'list', 'devices', 'available', '-j']);
    const parsed = JSON.parse(out);
    const candidates = [];
    for (const list of Object.values(parsed.devices || {})) {
      for (const d of list) {
        if (!d.isAvailable) continue;
        const m = d.name.match(/^iPhone\s+(\d+)/);
        if (!m) continue;
        candidates.push({ ...d, model: parseInt(m[1], 10) });
      }
    }
    if (candidates.length === 0) {
      warn('no available iPhone simulators — install one via Xcode → Settings → Platforms');
      return null;
    }
    const tier = (name) =>
      /Pro Max/.test(name) ? 3 : /Pro/.test(name) ? 2 : /Plus/.test(name) ? 1 : 0;
    candidates.sort((a, b) => b.model - a.model || tier(b.name) - tier(a.name));
    const pick = candidates[0];
    info(`booting ${pick.name}…`);
    run('xcrun', ['simctl', 'boot', pick.udid], { allowFail: true });
    // Bring Simulator.app to the foreground so the user sees the window.
    run('open', ['-a', 'Simulator'], { allowFail: true });
    ok(`booted ${pick.name}`);
    return pick.udid;
  } catch (err) {
    warn(`could not enumerate simulators: ${err.message}`);
    return null;
  }
}

const targetUdid = pickSimulatorTarget();

step(8, 'Building + installing + launching on simulator');
let launched = false;
if (targetUdid) {
  // --no-sync because step 4 already ran cap sync ios.
  const result = run('pnpm', ['exec', 'cap', 'run', 'ios', '--target', targetUdid, '--no-sync'], {
    cwd: UI,
    allowFail: true,
  });
  if (result?.status === 0) {
    ok('app launched on simulator');
    launched = true;
  } else {
    warn(`cap run ios failed (exit ${result?.status}) — falling back to Xcode`);
  }
}

if (!launched) {
  // Fallback: open the project so the user can press ⌘R themselves.
  // Prefer .xcworkspace if it exists (CocoaPods setup); else .xcodeproj
  // (Swift Package Manager / Capacitor 7+ default).
  const xcworkspace = join(iosDir, 'App.xcworkspace');
  const xcodeproj = join(iosDir, 'App.xcodeproj');
  const openTarget = existsSync(xcworkspace)
    ? xcworkspace
    : existsSync(xcodeproj)
      ? xcodeproj
      : null;
  if (openTarget) {
    info('opening Xcode — press ⌘R to run');
    run('open', [openTarget], { allowFail: true });
  } else {
    warn('Neither App.xcworkspace nor App.xcodeproj found — open the project manually.');
  }
}

info('');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (launched) {
  info('App is running on the simulator. Edit Svelte files — the WebView');
  info('hits localhost:5173 so changes hot-reload automatically.');
} else {
  info('iOS simulator finds localhost:5173 automatically.');
  info('Real device on same wifi finds your Mac via Bonjour.');
}
info('Press Ctrl+C in this terminal to stop the dev server.');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Relay Ctrl+C to the dev server.
process.on('SIGINT', () => {
  dev.kill('SIGTERM');
  process.exit(0);
});
// Wait on the dev server.
await new Promise((resolve) => dev.on('exit', resolve));
