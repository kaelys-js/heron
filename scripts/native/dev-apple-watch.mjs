#!/usr/bin/env node
/**
 * dev-apple-watch -- one-shot: build + install + launch the watchOS app.
 *
 * The Watch app lives at ui/ios/App/WatchApp/ as a standalone
 * watchOS 10+ SwiftUI app (Single Target -- no WatchKit Extension). It
 * shows the top job to apply to + open issues, reads from the App Group
 * container `group.com.heron.app`, and receives live updates
 * via WCSession from the paired iPhone.
 *
 * Flow:
 *   1. Preflight -- xcode tools + watch sim runtime
 *   2. Apply brand (idempotent)
 *   3. Run add-xcode-targets.rb (registers WatchApp target if
 *      missing; idempotent)
 *   4. Confirm WatchApp scheme actually exists in the project.
 *      If not → opens Xcode + prints setup instructions (the watch
 *      target needs one-time wiring via Xcode UI; see
 *      WatchApp/WatchApp.swift's header for steps).
 *   5. Pick a watch simulator -- boot it if needed
 *   6. xcodebuild -scheme WatchApp -destination 'id=…'
 *   7. xcrun simctl install + launch
 *
 * The Watch app has NO WebView -- no Vite server is needed. Live job
 * data flows over WCSession from the paired iPhone app, which itself
 * reads from the dashboard via the normal SvelteKit stack. Run
 * `pnpm dev:ios` in another terminal if you want the full data flow.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { step, run, capture, which, ok, warn, info, UI, ROOT } from './_lib.mjs';

const iosDir = join(UI, 'ios', 'App');
const watchSourceDir = join(iosDir, 'WatchApp');
const xcodeproj = join(iosDir, 'App.xcodeproj');
const pbxprojPath = join(xcodeproj, 'project.pbxproj');

step(1, 'Preflight');
if (!which('xcodebuild') || !which('xcrun')) {
  console.error('Xcode CLI tools not found — install Xcode from the App Store');
  process.exit(1);
}
if (!existsSync(watchSourceDir)) {
  console.error(`Watch source dir not found: ${watchSourceDir}`);
  console.error('The watchOS app source lives in ui/ios/App/WatchApp/.');
  process.exit(1);
}
if (!existsSync(pbxprojPath)) {
  console.error('ios/App/App.xcodeproj not found — run `pnpm exec cap add ios` first');
  process.exit(1);
}

step(2, 'Applying brand (idempotent — propagates branding/brand.json)');
run('node', [join(ROOT, 'scripts/native/apply-brand.mjs')], { silent: true });

step(3, 'Ensuring Xcode targets are registered');
if (which('ruby') && which('gem')) {
  run('gem', ['install', 'xcodeproj', 'plist', '--user-install', '--no-document'], {
    silent: true,
    allowFail: true,
  });
  run('ruby', [join(ROOT, 'scripts', 'native', 'add-xcode-targets.rb')], {
    cwd: iosDir,
    allowFail: true,
  });
} else {
  warn('ruby/gem not on PATH — skipping target registration');
}

step(4, 'Checking the WatchApp scheme exists in App.xcodeproj');
// Read the pbxproj as text -- fastest way to check target presence
// without spawning xcodebuild -list (which can take 30s+ resolving SPM).
const pbxText = readFileSync(pbxprojPath, 'utf8');
const watchTargetRegistered =
  pbxText.includes('WatchApp') && /WatchApp.*PBXNativeTarget/s.test(pbxText);

if (!watchTargetRegistered) {
  warn('WatchApp target is not registered in App.xcodeproj yet.');
  info('');
  info('One-time setup in Xcode (~5 min):');
  info('  1. File → New → Target → watchOS → "App"');
  info('     • Product name: WatchApp');
  info('     • Bundle ID:    com.heron.app.watchkitapp');
  info('     • Interface:    SwiftUI');
  info('     • Embed in companion iOS app: "App"');
  info('  2. Delete the auto-generated files Xcode creates inside');
  info('     WatchApp/ — keep ours (WatchApp.swift,');
  info('     RootView.swift, WatchModel.swift).');
  info('  3. In the watch target settings:');
  info('     • Signing & Capabilities → +Capability → App Groups');
  info('       → group.com.heron.app');
  info('     • Info → WKCompanionAppBundleIdentifier = com.heron.app');
  info('     • Info → WKWatchOnly = NO');
  info('  4. Save + close Xcode. Then re-run `pnpm dev:apple-watch`.');
  info('');
  info('Opening Xcode now…');
  run('open', [xcodeproj], { allowFail: true });
  process.exit(0);
}
ok('WatchApp is registered');

step(5, 'Picking a watchOS simulator target');
/** Tier function -- Ultra beats Series 11 beats Series 10, etc. */
const watchTier = (name) => {
  const m = name.match(/Apple Watch (Series|Ultra)\s*(\d+)?/i);
  if (!m) return -1;
  return m[1].toLowerCase() === 'ultra' ? 1000 : parseInt(m[2] ?? '0', 10);
};

/**
 * Reuse a booted watch sim if any; else boot an existing-but-shutdown
 * sim; else CREATE one from the newest installed watch device type +
 * runtime (Xcode ships device-types but doesn't create sim instances
 * by default -- first run after Xcode install needs the create step).
 */
function pickWatchSim() {
  const devicesJson = capture('xcrun', ['simctl', 'list', 'devices', '-j'], {
    allowFail: true,
  });
  const devices = JSON.parse(devicesJson);

  // 1. Already-booted watch wins.
  for (const [runtime, list] of Object.entries(devices.devices || {})) {
    if (!runtime.toLowerCase().includes('watch')) continue;
    for (const d of list) {
      if (d.state === 'Booted') {
        ok(`reusing booted watch sim: ${d.name}`);
        return d.udid;
      }
    }
  }

  // 2. Existing shutdown watch sims -- boot the newest.
  const existing = [];
  for (const [runtime, list] of Object.entries(devices.devices || {})) {
    if (!runtime.toLowerCase().includes('watch')) continue;
    for (const d of list) {
      if (!d.isAvailable) continue;
      const tier = watchTier(d.name);
      if (tier < 0) continue;
      existing.push({ ...d, tier });
    }
  }
  if (existing.length > 0) {
    existing.sort((a, b) => b.tier - a.tier);
    const pick = existing[0];
    info(`booting existing sim: ${pick.name}…`);
    run('xcrun', ['simctl', 'boot', pick.udid], { allowFail: true });
    run('open', ['-a', 'Simulator'], { allowFail: true });
    ok(`booted ${pick.name}`);
    return pick.udid;
  }

  // 3. No sim instances -- create one from the newest device-type + runtime.
  info('no watch sims exist — creating one from installed device types');
  let typesJson, runtimesJson;
  try {
    typesJson = JSON.parse(
      capture('xcrun', ['simctl', 'list', 'devicetypes', '-j'], { allowFail: true }),
    );
    runtimesJson = JSON.parse(
      capture('xcrun', ['simctl', 'list', 'runtimes', '-j'], { allowFail: true }),
    );
  } catch (err) {
    warn(`could not list watch types/runtimes: ${err.message}`);
    return null;
  }

  const watchTypes = (typesJson.devicetypes || [])
    .filter((t) => t.identifier?.includes('Apple-Watch') && watchTier(t.name) >= 0)
    .map((t) => ({ ...t, tier: watchTier(t.name) }))
    .sort((a, b) => b.tier - a.tier);
  const watchRuntimes = (runtimesJson.runtimes || [])
    .filter((r) => r.isAvailable && r.platform === 'watchOS')
    .sort((a, b) => {
      // Newest runtime first -- version is "10.4" / "11.2" etc.
      const va = (a.version ?? '').split('.').map(Number);
      const vb = (b.version ?? '').split('.').map(Number);
      for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const d = (vb[i] ?? 0) - (va[i] ?? 0);
        if (d) return d;
      }
      return 0;
    });

  // Watch device types ship with Xcode but the watchOS RUNTIME is a
  // separate ~5GB download. If types exist but runtime doesn't, kick off
  // `xcodebuild -downloadPlatform watchOS` which is the modern (Xcode 15+)
  // headless equivalent of clicking Xcode → Settings → Platforms → watchOS
  // → GET. Runs in foreground so the user sees the download progress; on
  // first run this takes 5-15 min depending on network. allowFail because
  // download requires Apple ID auth in some configurations -- if it can't
  // download silently we fall through to the helpful error below.
  if (watchTypes.length > 0 && watchRuntimes.length === 0) {
    info('watch device types are installed but no watchOS runtime exists.');
    info('Downloading watchOS runtime via `xcodebuild -downloadPlatform watchOS`…');
    info('This is a ~5GB one-time download — expect 5-15 min on first run.');
    const dl = run('xcodebuild', ['-downloadPlatform', 'watchOS'], {
      allowFail: true,
    });
    if (dl?.status === 0) {
      ok('watchOS runtime downloaded — re-scanning available runtimes');
      // Re-parse runtimes after download.
      try {
        runtimesJson = JSON.parse(
          capture('xcrun', ['simctl', 'list', 'runtimes', '-j'], { allowFail: true }),
        );
        watchRuntimes.length = 0;
        for (const r of runtimesJson.runtimes || []) {
          if (r.isAvailable && r.platform === 'watchOS') {
            watchRuntimes.push(r);
          }
        }
        watchRuntimes.sort((a, b) => {
          const va = (a.version ?? '').split('.').map(Number);
          const vb = (b.version ?? '').split('.').map(Number);
          for (let i = 0; i < Math.max(va.length, vb.length); i++) {
            const d = (vb[i] ?? 0) - (va[i] ?? 0);
            if (d) return d;
          }
          return 0;
        });
      } catch {
        /* fall through to error path */
      }
    } else {
      warn(`xcodebuild -downloadPlatform exited ${dl?.status} — manual install needed`);
    }
  }

  if (watchTypes.length === 0 || watchRuntimes.length === 0) {
    warn(
      `no watch device types (${watchTypes.length}) or runtimes (${watchRuntimes.length}) installed.`,
    );
    warn('Install manually:');
    warn('  open -a Xcode and go to Settings → Platforms → watchOS → Get');
    warn('  OR run: xcodebuild -downloadPlatform watchOS');
    warn('  (~5GB download; may require Apple ID auth)');
    return null;
  }

  const type = watchTypes[0];
  const runtime = watchRuntimes[0];
  const simName = `${type.name} (heron auto-created)`;
  info(`creating sim: "${simName}" · type=${type.identifier} · runtime=${runtime.identifier}`);
  const result = run('xcrun', ['simctl', 'create', simName, type.identifier, runtime.identifier], {
    allowFail: true,
  });
  if (result?.status !== 0) {
    warn(`simctl create failed (exit ${result?.status}) — see above`);
    return null;
  }
  // Refresh the device list so we can find the new UDID by name.
  const after = JSON.parse(capture('xcrun', ['simctl', 'list', 'devices', '-j']));
  let newUdid = null;
  for (const list of Object.values(after.devices || {})) {
    for (const d of list) {
      if (d.name === simName) {
        newUdid = d.udid;
        break;
      }
    }
    if (newUdid) break;
  }
  if (!newUdid) {
    warn('created sim but could not find its UDID — `xcrun simctl list devices` manually');
    return null;
  }
  info(`booting newly-created sim: ${simName}…`);
  run('xcrun', ['simctl', 'boot', newUdid], { allowFail: true });
  run('open', ['-a', 'Simulator'], { allowFail: true });
  ok(`booted ${simName}`);
  return newUdid;
}

const watchUdid = pickWatchSim();
if (!watchUdid) {
  process.exit(1);
}

step(6, 'Building WatchApp for the watch simulator');
const derivedData = join(iosDir, 'DerivedData', watchUdid);
const result = run(
  'xcodebuild',
  [
    '-project',
    'App.xcodeproj',
    '-scheme',
    'WatchApp',
    '-configuration',
    'Debug',
    '-destination',
    `id=${watchUdid}`,
    '-derivedDataPath',
    derivedData,
    '-quiet',
    'build',
  ],
  { cwd: iosDir, allowFail: true },
);
if (result?.status !== 0) {
  warn(`xcodebuild failed (exit ${result?.status})`);
  warn('Open Xcode → WatchApp scheme → ⌘B to see the full error in the IDE.');
  run('open', [xcodeproj], { allowFail: true });
  process.exit(1);
}
ok('build succeeded');

step(7, 'Installing + launching on watch sim');
const appPath = join(derivedData, 'Build', 'Products', 'Debug-watchsimulator', 'WatchApp.app');
if (!existsSync(appPath)) {
  warn(`built app not found at ${appPath}`);
  warn('Xcode build settings may differ — open the project to inspect.');
  process.exit(1);
}
run('xcrun', ['simctl', 'install', watchUdid, appPath], { allowFail: true });
const bundleId = 'com.heron.app.watchkitapp';
const launch = run('xcrun', ['simctl', 'launch', watchUdid, bundleId], { allowFail: true });
if (launch?.status === 0) {
  ok('WatchApp launched on the watch simulator');
} else {
  warn(`launch failed (exit ${launch?.status}) — install succeeded but launch did not`);
  warn(`Verify CFBundleIdentifier matches "${bundleId}" in WatchApp/Info.plist.`);
}

info('');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
info('Watch app running. Data flows in from the paired iPhone via');
info('WCSession — run `pnpm dev:ios` in another terminal for the full');
info('end-to-end stack. Edits to WatchApp/*.swift require re-running');
info('this script (no hot-reload for SwiftUI on watchOS).');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
