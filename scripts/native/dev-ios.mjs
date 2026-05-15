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
import { existsSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import os from 'node:os';
import { step, run, capture, which, ok, warn, info, UI, ROOT } from './_lib.mjs';

const iosDir = join(UI, 'ios', 'App');

// --live: WebView loads from the Mac's LAN IP : Vite (true HMR on device +
// simulator) instead of the bundled static build. The flag flows through
// CAPACITOR_SERVER_URL, which capacitor.config.ts reads to set server.url;
// `cap sync ios` then writes it into ios/App/App/capacitor.config.json so the
// WebView fetches from Vite. Production `pnpm build:ios` must NEVER set this.
const isLive = process.argv.includes('--live');

/** Find a non-loopback IPv4 on a private LAN range (RFC 1918). */
function getLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (
        i.family === 'IPv4' &&
        !i.internal &&
        (i.address.startsWith('192.168.') ||
          i.address.startsWith('10.') ||
          /^172\.(1[6-9]|2[0-9]|3[01])\./.test(i.address))
      ) {
        return i.address;
      }
    }
  }
  return null;
}

const lanIp = isLive ? getLanIp() : null;
if (isLive && !lanIp) {
  console.error('--live: could not detect Mac LAN IP. Connect to wifi/ethernet first.');
  process.exit(1);
}
const liveUrl = lanIp ? `http://${lanIp}:5173` : null;
if (isLive) {
  info(`live mode: WebView will load from ${liveUrl}`);
}

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

if (isLive) {
  step(3, 'Skipping static build (live mode — WebView points at Vite)');
  info('  build/static is reused if present; cap sync still needs SOMETHING to copy');
  // cap sync ios requires webDir to exist — produce a minimal placeholder if
  // missing so the sync step doesn't error. The WebView never reads this dir
  // in live mode (server.url overrides it).
  const webDir = join(UI, 'build', 'static');
  if (!existsSync(webDir)) {
    info(
      '  no prior build/static found — running a one-shot build so cap sync has something to copy',
    );
    run('pnpm', ['build'], {
      cwd: UI,
      env: { CAPACITOR: '1', PUBLIC_CAPACITOR_BUILD: '1' },
    });
  }
} else {
  step(3, 'Building static shell for Capacitor');
  run('pnpm', ['build'], {
    cwd: UI,
    env: { CAPACITOR: '1', PUBLIC_CAPACITOR_BUILD: '1' },
  });
}

step(4, 'Syncing iOS project' + (isLive ? ` (server.url=${liveUrl})` : ''));
run('pnpm', ['exec', 'cap', 'sync', 'ios'], {
  cwd: UI,
  // CAPACITOR_SERVER_URL is read by ui/capacitor.config.ts at sync time —
  // present → server.url is written into ios/App/App/capacitor.config.json,
  // absent → no server.url key (bundled static, what production wants).
  env: isLive ? { CAPACITOR_SERVER_URL: liveUrl } : {},
});

// `cap add ios` only registered AppDelegate.swift with the App target.
// Native features added later (BonjourBrowser, NetworkMonitor, Biometric,
// KeychainStore, BackgroundFetcher, SpotlightIndexer, WatchSessionBridge,
// CareerOpsNativePlugin, ErrorReporter, Brand) live in App/*.swift on disk
// but aren't auto-added to the target. Without this step, xcodebuild
// fails with "cannot find type 'BonjourBrowser' in scope" the moment
// AppDelegate references them. The ruby script is idempotent — no-op
// when the pbxproj is already up-to-date.
step('4b', 'Ensuring App target includes all Swift sources');
if (which('ruby') && which('gem')) {
  // Both gems must be present for the script to load. --user-install
  // writes to ~/.gem and never needs sudo; --no-document skips slow
  // rdoc generation. allowFail so a flaky gem mirror doesn't kill dev.
  run('gem', ['install', 'xcodeproj', 'plist', '--user-install', '--no-document'], {
    silent: true,
    allowFail: true,
  });
  run('ruby', [join(ROOT, 'scripts', 'native', 'add-xcode-targets.rb')], {
    cwd: iosDir,
    allowFail: true,
  });
} else {
  warn('ruby/gem not on PATH — skipping App-target source sync');
}

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
// Kill any process still bound to :5173 from a previous dev:ios run —
// otherwise vite errors with EADDRINUSE and the WebView ends up serving
// a stale build. lsof + kill is the simplest portable check; macOS-only
// is fine here since dev:ios is iOS-simulator-specific anyway.
try {
  const { execSync } = await import('node:child_process');
  const pids = execSync('lsof -ti:5173 2>/dev/null || true', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  if (pids.length > 0) {
    info(`killing stale process(es) on :5173 → pid ${pids.join(', ')}`);
    execSync(`kill -9 ${pids.join(' ')} 2>/dev/null || true`);
    // brief pause to let the kernel release the socket
    await new Promise((r) => setTimeout(r, 300));
  }
} catch {
  /* non-fatal — vite will surface EADDRINUSE if it's still blocked */
}
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
  // --scheme App: Capacitor otherwise passes `ios.scheme` from
  // capacitor.config.ts (e.g. `heron`) as the xcodebuild scheme,
  // which is wrong — that's the URL scheme, not the build scheme.
  // The Xcode-generated build scheme is always named `App` (matches
  // the target name) so we pin it explicitly.
  const result = run(
    'pnpm',
    ['exec', 'cap', 'run', 'ios', '--target', targetUdid, '--scheme', 'App', '--no-sync'],
    {
      cwd: UI,
      allowFail: true,
    },
  );
  if (result?.status === 0) {
    ok('app launched on simulator');
    launched = true;
  } else {
    warn(`cap run ios failed (exit ${result?.status}) — falling back to Xcode`);
  }
}

if (!launched) {
  // Hard-fail instead of silently opening Xcode. Opening Xcode hides the
  // root cause (missing simulator runtime, stale DerivedData, etc.) and
  // forces the user to debug via the Xcode UI dance — anti-goal for
  // `pnpm dev:ios`, which should be one command + a working app.
  console.error('');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('cap run ios failed');
  console.error('');
  console.error('Common causes + fixes:');
  console.error('  • Missing simulator runtime: Xcode → Settings → Platforms → iOS');
  console.error('  • Stale DerivedData: rm -rf ui/ios/DerivedData');
  console.error('  • Signing issue: sudo xcode-select --reset');
  console.error('  • Swift build error: scroll up — xcodebuild printed the failing line');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    dev.kill('SIGTERM');
  } catch {
    /* dev server already exited */
  }
  process.exit(1);
}

info('');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
info('App is running on the simulator.');
if (isLive) {
  info(`Live mode: WebView is loading ${liveUrl}`);
  info('Editing Svelte files hot-reloads INSTANTLY via Vite HMR — no rebuild.');
} else {
  info('Bundled-static mode (no --live). The WebView loads from App.app/public.');
  info('Edits to Svelte files require a rebuild. Pass --live for HMR.');
}

// Swift "HMR" — auto rebuild + reinstall when any *.swift file changes.
// Pure Swift is compiled, so there's no JS-style live-patch possible;
// the best we can do is detect file changes, run the same xcodebuild +
// install + launch the cold-boot path used, and relaunch the app
// automatically. End-to-end cycle on a warm cache: ~10-25s depending
// on how much of the dependency graph changes.
//
// Default ON in --live mode (the active-iteration mode); user can
// opt out with --no-swift-watch if rebuilds are expensive on their
// machine. Default OFF in bundled-static mode where the user is
// likely doing a one-shot deploy.
const swiftWatchOptIn = !process.argv.includes('--no-swift-watch');
const swiftWatchEnabled = isLive && swiftWatchOptIn;
if (swiftWatchEnabled) {
  info('Swift HMR: editing .swift files auto-rebuilds + reinstalls (10-25s).');
} else if (isLive) {
  info('Swift HMR disabled (--no-swift-watch).');
}
info('Press Ctrl+C in this terminal to stop the dev server.');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

/**
 * Swift HMR machinery — recursive fs.watch over every Xcode target's
 * source dir, debounced to coalesce burst saves (Xcode + Cursor both
 * write multiple times per "save"). On change, runs the same cap-run
 * pipeline used at cold-boot. Output streams to stdout so the user
 * sees compiler errors in real time.
 *
 * Why fs.watch + recursive instead of chokidar / fswatch:
 *   - fs.watch's `recursive: true` is supported on macOS + Windows
 *     (Linux ignores it, falls back to per-dir; not relevant here
 *     since iOS dev is Mac-only).
 *   - Zero extra dependencies — the whole watcher fits in ~40 lines.
 *
 * Race avoidance: only ONE rebuild runs at a time. If a save fires
 * during an in-flight rebuild, we queue a "rebuild needed" flag and
 * fire one final rebuild after the current one completes (coalescing
 * multiple bursts into a single re-run instead of a per-save backlog).
 */
function installSwiftWatcher(targetUdid) {
  if (!swiftWatchEnabled) return;
  const watchRoots = [
    join(iosDir, 'App'),
    join(iosDir, 'CareerOpsWidget'),
    join(iosDir, 'CareerOpsLiveActivity'),
    join(iosDir, 'CareerOpsShareExtension'),
    join(iosDir, 'CareerOpsWatch'),
  ].filter(existsSync);

  let debounceTimer = null;

  function rebuildOnce(triggerFile) {
    info('');
    info(`🔁 Swift change: ${triggerFile.replace(ROOT, '')}`);
    info('   rebuilding + reinstalling…');
    const started = Date.now();
    try {
      // Same command the cold-boot path runs at step 8 — `cap run ios`
      // wraps xcodebuild + simctl install + simctl launch. --no-sync
      // skips the cap-sync step (we already synced at boot; only Swift
      // changed, not the WebView bundle).
      //
      // NOTE: run() is synchronous (spawnSync). Node's event loop is
      // frozen for the duration of the build (~10-25s). File events
      // that arrive during that window queue at the OS level; when
      // we return, the watcher fires once per queued save and the
      // debounce coalesces them into ONE follow-up rebuild. That's
      // the "tail-call" behaviour the user wants — keep editing and
      // the final state is what ends up on device.
      const result = run(
        'pnpm',
        ['exec', 'cap', 'run', 'ios', '--target', targetUdid, '--scheme', 'App', '--no-sync'],
        { cwd: UI, allowFail: true },
      );
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      if (result?.status === 0) {
        ok(`Swift rebuild complete (${elapsed}s)`);
      } else {
        warn(
          `Swift rebuild failed (exit ${result?.status}, ${elapsed}s) — check xcodebuild output above`,
        );
      }
    } catch (err) {
      warn(`Swift rebuild crashed: ${err?.message ?? err}`);
    }
  }

  function scheduleRebuild(file) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      rebuildOnce(file);
    }, 500);
  }

  for (const root of watchRoots) {
    try {
      const watcher = fsWatch(root, { recursive: true }, (_eventType, filename) => {
        if (!filename || !filename.endsWith('.swift')) return;
        scheduleRebuild(join(root, filename));
      });
      // unref() so the watcher doesn't keep the event loop alive on its
      // own — the script ends when SIGINT/etc fires, not when watchers
      // see no more events.
      watcher.unref?.();
    } catch (err) {
      warn(`Swift watcher could not attach to ${root}: ${err?.message ?? err}`);
    }
  }
}
installSwiftWatcher(targetUdid);

// Relay terminate signals to the dev (vite) child so vite doesn't get
// orphaned when this script dies. Pre-fix only SIGINT (Ctrl+C) was
// handled — if the parent shell sent SIGTERM, SIGHUP, or the user
// closed the terminal, vite kept running as a zombie. Three signal
// channels cover every common kill path:
//
//   • SIGINT  — Ctrl+C (most common)
//   • SIGTERM — `kill <pid>` / parent-process kill (e.g. when the
//               background-task wrapper dies)
//   • SIGHUP  — terminal window closed
//
// We also escalate to SIGKILL after a 5s grace period so a stuck vite
// can't keep us alive indefinitely. exit(0) so other tooling reading
// our exit code doesn't think we crashed.
function shutdown(signal) {
  info(`received ${signal} — stopping dev server`);
  try {
    dev.kill('SIGTERM');
  } catch {
    /* already gone */
  }
  // Escalate if vite ignores SIGTERM (it usually doesn't, but just in case).
  const hardKill = setTimeout(() => {
    try {
      dev.kill('SIGKILL');
    } catch {
      /* race with natural exit */
    }
  }, 5_000);
  dev.once('exit', () => {
    clearTimeout(hardKill);
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP', () => shutdown('SIGHUP'));
// Wait on the dev server.
await new Promise((resolve) => dev.on('exit', resolve));
