#!/usr/bin/env node
/**
 * dev-apple-watch — one-shot: build + install + launch the watchOS app.
 *
 * The Watch app lives at ui/ios/App/CareerOpsWatch/ as a standalone
 * watchOS 10+ SwiftUI app (Single Target — no WatchKit Extension). It
 * shows the top job to apply to + open issues, reads from the App Group
 * container `group.com.resistjs.careerops`, and receives live updates
 * via WCSession from the paired iPhone.
 *
 * Flow:
 *   1. Preflight — xcode tools + watch sim runtime
 *   2. Apply brand (idempotent)
 *   3. Run add-xcode-targets.rb (registers CareerOpsWatch target if
 *      missing; idempotent)
 *   4. Confirm CareerOpsWatch scheme actually exists in the project.
 *      If not → opens Xcode + prints setup instructions (the watch
 *      target needs one-time wiring via Xcode UI; see
 *      CareerOpsWatch/CareerOpsWatchApp.swift's header for steps).
 *   5. Pick a watch simulator — boot it if needed
 *   6. xcodebuild -scheme CareerOpsWatch -destination 'id=…'
 *   7. xcrun simctl install + launch
 *
 * The Watch app has NO WebView — no Vite server is needed. Live job
 * data flows over WCSession from the paired iPhone app, which itself
 * reads from the dashboard via the normal SvelteKit stack. Run
 * `pnpm dev:ios` in another terminal if you want the full data flow.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { step, run, capture, which, ok, warn, info, UI, ROOT } from './_lib.mjs';

const iosDir = join(UI, 'ios', 'App');
const watchSourceDir = join(iosDir, 'CareerOpsWatch');
const xcodeproj = join(iosDir, 'App.xcodeproj');
const pbxprojPath = join(xcodeproj, 'project.pbxproj');

step(1, 'Preflight');
if (!which('xcodebuild') || !which('xcrun')) {
  console.error('Xcode CLI tools not found — install Xcode from the App Store');
  process.exit(1);
}
if (!existsSync(watchSourceDir)) {
  console.error(`Watch source dir not found: ${watchSourceDir}`);
  console.error('The watchOS app source lives in ui/ios/App/CareerOpsWatch/.');
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

step(4, 'Checking the CareerOpsWatch scheme exists in App.xcodeproj');
// Read the pbxproj as text — fastest way to check target presence
// without spawning xcodebuild -list (which can take 30s+ resolving SPM).
const pbxText = readFileSync(pbxprojPath, 'utf8');
const watchTargetRegistered =
  pbxText.includes('CareerOpsWatch') && /CareerOpsWatch.*PBXNativeTarget/s.test(pbxText);

if (!watchTargetRegistered) {
  warn('CareerOpsWatch target is not registered in App.xcodeproj yet.');
  info('');
  info('One-time setup in Xcode (~5 min):');
  info('  1. File → New → Target → watchOS → "App"');
  info('     • Product name: CareerOpsWatch');
  info('     • Bundle ID:    com.resistjs.careerops.watchkitapp');
  info('     • Interface:    SwiftUI');
  info('     • Embed in companion iOS app: "App"');
  info('  2. Delete the auto-generated files Xcode creates inside');
  info('     CareerOpsWatch/ — keep ours (CareerOpsWatchApp.swift,');
  info('     RootView.swift, WatchModel.swift).');
  info('  3. In the watch target settings:');
  info('     • Signing & Capabilities → +Capability → App Groups');
  info('       → group.com.resistjs.careerops');
  info('     • Info → WKCompanionAppBundleIdentifier = com.resistjs.careerops');
  info('     • Info → WKWatchOnly = NO');
  info('  4. Save + close Xcode. Then re-run `pnpm dev:apple-watch`.');
  info('');
  info('Opening Xcode now…');
  run('open', [xcodeproj], { allowFail: true });
  process.exit(0);
}
ok('CareerOpsWatch is registered');

step(5, 'Picking a watchOS simulator target');
/** Reuse a booted watch sim if any; else boot the newest Apple Watch. */
function pickWatchSim() {
  const out = capture('xcrun', ['simctl', 'list', 'devices', '-j'], {
    allowFail: true,
  });
  const parsed = JSON.parse(out);
  // 1. Already-booted watch wins.
  for (const [runtime, list] of Object.entries(parsed.devices || {})) {
    if (!runtime.toLowerCase().includes('watch')) continue;
    for (const d of list) {
      if (d.state === 'Booted') {
        ok(`reusing booted watch sim: ${d.name}`);
        return d.udid;
      }
    }
  }
  // 2. Boot the newest available watch.
  const candidates = [];
  for (const [runtime, list] of Object.entries(parsed.devices || {})) {
    if (!runtime.toLowerCase().includes('watch')) continue;
    for (const d of list) {
      if (!d.isAvailable) continue;
      const m = d.name.match(/Apple Watch (Series|Ultra)\s*(\d+)?/i);
      if (!m) continue;
      const series = m[1].toLowerCase() === 'ultra' ? 100 : parseInt(m[2] ?? '0', 10);
      candidates.push({ ...d, series });
    }
  }
  if (candidates.length === 0) {
    warn('No watchOS simulators available.');
    warn(
      'Install one via Xcode → Settings → Platforms → watchOS, then create a sim in Device Manager.',
    );
    return null;
  }
  candidates.sort((a, b) => b.series - a.series);
  const pick = candidates[0];
  info(`booting ${pick.name}…`);
  run('xcrun', ['simctl', 'boot', pick.udid], { allowFail: true });
  run('open', ['-a', 'Simulator'], { allowFail: true });
  ok(`booted ${pick.name}`);
  return pick.udid;
}

const watchUdid = pickWatchSim();
if (!watchUdid) {
  process.exit(1);
}

step(6, 'Building CareerOpsWatch for the watch simulator');
const derivedData = join(iosDir, 'DerivedData', watchUdid);
const result = run(
  'xcodebuild',
  [
    '-project',
    'App.xcodeproj',
    '-scheme',
    'CareerOpsWatch',
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
  warn('Open Xcode → CareerOpsWatch scheme → ⌘B to see the full error in the IDE.');
  run('open', [xcodeproj], { allowFail: true });
  process.exit(1);
}
ok('build succeeded');

step(7, 'Installing + launching on watch sim');
const appPath = join(
  derivedData,
  'Build',
  'Products',
  'Debug-watchsimulator',
  'CareerOpsWatch.app',
);
if (!existsSync(appPath)) {
  warn(`built app not found at ${appPath}`);
  warn('Xcode build settings may differ — open the project to inspect.');
  process.exit(1);
}
run('xcrun', ['simctl', 'install', watchUdid, appPath], { allowFail: true });
const bundleId = 'com.resistjs.careerops.watchkitapp';
const launch = run('xcrun', ['simctl', 'launch', watchUdid, bundleId], { allowFail: true });
if (launch?.status === 0) {
  ok('CareerOpsWatch launched on the watch simulator');
} else {
  warn(`launch failed (exit ${launch?.status}) — install succeeded but launch did not`);
  warn(`Verify CFBundleIdentifier matches "${bundleId}" in CareerOpsWatch/Info.plist.`);
}

info('');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
info('Watch app running. Data flows in from the paired iPhone via');
info('WCSession — run `pnpm dev:ios` in another terminal for the full');
info('end-to-end stack. Edits to CareerOpsWatch/*.swift require re-running');
info('this script (no hot-reload for SwiftUI on watchOS).');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
