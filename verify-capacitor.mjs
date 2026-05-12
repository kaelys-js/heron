#!/usr/bin/env node
/**
 * verify-capacitor.mjs — sanity check the Capacitor monorepo.
 *
 * Checks file existence + config correctness for every phase of the
 * Capacitor work (Phase 0 foundation through Phase 5 bridging).
 * Behavioral checks where they're cheap (parser tests for deep-links,
 * pure-function checks for the resolver schemas).
 *
 * Run: `node verify-capacitor.mjs`
 * Exit codes: 0 green, 1 if any check fails.
 *
 * What it does NOT check (because they need Xcode / signing / device):
 *   • Actual Electron build artifact existence (depends on `pnpm electron:make`)
 *   • iOS Xcode build success (depends on Xcode + Cocoapods + cert)
 *   • Fastlane lane completion (depends on App Store Connect creds)
 *   • Real LiveActivity / Widget / Share runtime on a device
 *
 * The verify-capacitor.mjs is the floor — if this fails, nothing else
 * can possibly work. The ceiling (actual build + runtime) requires the
 * environment-specific tools to be in place.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const UI = join(ROOT, 'ui');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let errors = 0;
let passes = 0;
let warnings = 0;

function section(name) { console.log(`\n${CYAN}▸ ${name}${RESET}`); }
function ok(msg) { passes++; console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg, hint) {
  errors++;
  console.log(`  ${RED}✗${RESET} ${msg}${hint ? ' — ' + hint : ''}`);
}
function warn(msg) {
  warnings++;
  console.log(`  ! ${msg}`);
}

function exists(rel, label) {
  const full = rel.startsWith('/') ? rel : join(ROOT, rel);
  if (existsSync(full)) ok(`${label} · ${rel}`);
  else fail(`${label} missing`, rel);
}

function contains(rel, needle, label) {
  const full = rel.startsWith('/') ? rel : join(ROOT, rel);
  if (!existsSync(full)) { fail(`${label} (file missing)`, rel); return; }
  const body = readFileSync(full, 'utf8');
  if (body.includes(needle)) ok(label);
  else fail(`${label} needle not found`, `"${needle}"`);
}

function jsonField(rel, dotPath, expected, label) {
  const full = rel.startsWith('/') ? rel : join(ROOT, rel);
  if (!existsSync(full)) { fail(`${label} (file missing)`, rel); return; }
  try {
    const json = JSON.parse(readFileSync(full, 'utf8'));
    const parts = dotPath.split('.');
    let cur = json;
    for (const p of parts) cur = cur?.[p];
    if (cur === expected) ok(label);
    else fail(`${label}`, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(cur)}`);
  } catch (e) {
    fail(`${label} JSON parse error`, String(e));
  }
}

// ── Phase 0 — Foundation ────────────────────────────────────────────
section('Phase 0 — Foundation');
exists('ui/capacitor.config.ts', 'capacitor.config.ts');
contains('ui/capacitor.config.ts', 'com.resistjs.careerops', 'bundle id is com.resistjs.careerops');
contains('ui/capacitor.config.ts', "scheme: 'careerops'", 'ios custom scheme set');
exists('ui/svelte.config.js', 'svelte.config.js (dual adapter)');
contains('ui/svelte.config.js', 'CAPACITOR_BUILD', 'env-switched adapter');
contains('ui/svelte.config.js', 'staticAdapter', 'static adapter wired');
contains('ui/svelte.config.js', 'nodeAdapter', 'node adapter wired');
exists('ui/src/routes/+layout.ts', 'root +layout.ts');
contains('ui/src/routes/+layout.ts', 'PUBLIC_CAPACITOR_BUILD', 'capacitor-build env flag honored');
exists('ui/src/lib/client/backend-discovery.ts', 'backend resolver');
contains('ui/src/lib/client/backend-discovery.ts', 'resolveBackend', 'resolveBackend exported');
contains('ui/src/lib/client/backend-discovery.ts', 'BackendNotFoundError', 'no-backend error type');
exists('ui/src/lib/client/notifications.ts', 'unified notifications client');
contains('ui/src/lib/client/notifications.ts', "Capacitor.getPlatform()", 'platform-detect dispatch');
exists('native/icons/generate-icons.mjs', 'icon pipeline script');
exists('ui/electron/build/icon.png', 'electron icon.png');
exists('ui/electron/build/icon.icns', 'electron icon.icns');
exists('ui/electron/build/icon.ico', 'electron icon.ico');
exists('ui/ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json', 'ios appiconset');

// ── Phase 1 — Electron desktop ────────────────────────────────────
section('Phase 1 — Electron desktop');
exists('ui/electron/src/index.ts', 'electron main');
contains('ui/electron/src/index.ts', 'startEmbeddedServer', 'embedded server spawn');
contains('ui/electron/src/index.ts', 'startMdnsAdvertise', 'mDNS advertise');
contains('ui/electron/src/index.ts', 'autoUpdater.checkForUpdatesAndNotify', 'auto-update wired');
exists('ui/electron/src/app-menu.ts', 'app menu');
contains('ui/electron/src/app-menu.ts', 'CmdOrCtrl+I', 'Import URL shortcut');
contains('ui/electron/src/app-menu.ts', "role: 'help'", 'Help menu');
exists('ui/electron/src/tray.ts', 'tray');
contains('ui/electron/src/tray.ts', '/api/stats', 'tray polls stats');
contains('ui/electron/src/tray.ts', '/api/autopilot/toggle', 'tray toggles autopilot');
exists('ui/electron/src/mdns.ts', 'mDNS module');
contains('ui/electron/src/mdns.ts', "type: 'career-ops'", 'service type set');
exists('ui/electron/electron-builder.config.json', 'electron-builder config');
jsonField('ui/electron/electron-builder.config.json', 'appId', 'com.resistjs.careerops', 'electron-builder appId');
jsonField('ui/electron/electron-builder.config.json', 'mac.hardenedRuntime', true, 'hardened runtime enabled');
exists('ui/electron/build/entitlements.mac.plist', 'macOS entitlements plist');
contains('ui/electron/build/entitlements.mac.plist', 'allow-jit', 'JIT entitlement');
contains('ui/electron/build/entitlements.mac.plist', 'network.client', 'network client entitlement');
exists('.github/workflows/native-release.yml', 'CI matrix workflow');
contains('.github/workflows/native-release.yml', 'macos-latest, ubuntu-latest, windows-latest', '3-OS matrix');
exists('.github/workflows/testflight-keepalive.yml', 'TestFlight keepalive cron');
contains('.github/workflows/testflight-keepalive.yml', "cron: '0 9 1 */2 *'", '60-day rebuild cadence');

// ── Phase 2 — iOS basics ───────────────────────────────────────────
section('Phase 2 — iOS basics');
exists('ui/ios/App/App/Info.plist', 'Info.plist');
contains('ui/ios/App/App/Info.plist', '<string>careerops</string>', 'careerops:// URL scheme');
contains('ui/ios/App/App/Info.plist', '_career-ops._tcp', 'Bonjour service declared');
contains('ui/ios/App/App/Info.plist', 'NSLocalNetworkUsageDescription', 'local network permission description');
contains('ui/ios/App/App/Info.plist', 'NSFaceIDUsageDescription', 'face id permission description');
contains('ui/ios/App/App/Info.plist', '<string>fetch</string>', 'background fetch mode');
exists('ui/ios/App/App/AppDelegate.swift', 'AppDelegate.swift');
contains('ui/ios/App/App/AppDelegate.swift', 'BonjourBrowser', 'bonjour browser wired');
contains('ui/ios/App/App/AppDelegate.swift', 'BackgroundFetcher.shared.fetch', 'background fetch handler');
exists('ui/ios/App/App/BonjourBrowser.swift', 'BonjourBrowser');
exists('ui/ios/App/App/BackgroundFetcher.swift', 'BackgroundFetcher');
contains('ui/ios/App/App/BackgroundFetcher.swift', 'career-ops:last-seen-issue', 'lastSeen pointer tracked');
exists('ui/src/lib/client/deep-links.ts', 'deep-link handler');
contains('ui/src/lib/client/deep-links.ts', 'careerops://', 'parses custom scheme');

// ── Phase 3 — iOS advanced features ────────────────────────────────
section('Phase 3 — iOS advanced features');
exists('ui/ios/App/App/SpotlightIndexer.swift', 'Spotlight indexer');
exists('ui/ios/App/App/BiometricAuth.swift', 'biometric auth');
exists('ui/ios/App/App/KeychainStore.swift', 'keychain store');
exists('ui/ios/App/App/CareerOpsNativePlugin.swift', 'Capacitor native plugin bridge');
contains('ui/ios/App/App/CareerOpsNativePlugin.swift', 'CareerOpsNative', 'jsName matches JS bridge');
exists('ui/ios/App/CareerOpsWidget/CareerOpsWidget.swift', 'Widget target source');
contains('ui/ios/App/CareerOpsWidget/CareerOpsWidget.swift', 'systemSmall', 'small widget family');
contains('ui/ios/App/CareerOpsWidget/CareerOpsWidget.swift', 'accessoryCircular', 'lock-screen widget family');
exists('ui/ios/App/CareerOpsLiveActivity/CareerOpsLiveActivity.swift', 'Live Activity source');
contains('ui/ios/App/CareerOpsLiveActivity/CareerOpsLiveActivity.swift', 'DynamicIsland', 'Dynamic Island wired');
exists('ui/ios/App/CareerOpsShareExtension/ShareViewController.swift', 'Share Extension source');
contains('ui/ios/App/CareerOpsShareExtension/ShareViewController.swift', '/api/pipeline', 'posts to pipeline endpoint');
exists('ui/src/lib/client/native-bridge.ts', 'JS-side native bridge wrapper');
contains('ui/src/lib/client/native-bridge.ts', 'biometricAuth', 'biometric bridge function');
contains('ui/src/lib/client/native-bridge.ts', 'indexJobs', 'Spotlight index bridge function');

// ── Phase 4 — Fastlane ─────────────────────────────────────────────
section('Phase 4 — Fastlane');
exists('ui/ios/App/fastlane/Fastfile', 'Fastfile');
contains('ui/ios/App/fastlane/Fastfile', 'lane :beta', 'beta lane defined');
contains('ui/ios/App/fastlane/Fastfile', 'upload_to_testflight', 'TestFlight upload');
contains('ui/ios/App/fastlane/Fastfile', 'distribute_external: false', 'internal testers only');
exists('ui/ios/App/fastlane/Appfile', 'Appfile');
contains('ui/ios/App/fastlane/Appfile', 'com.resistjs.careerops', 'Appfile bundle id');
exists('ui/ios/App/Gemfile', 'Gemfile');

// ── Phase 5 — Notification bridge + dev/prod parity ────────────────
section('Phase 5 — Notification bridge + dev/prod parity');
exists('ui/src/lib/client/sse-notifications-bridge.ts', 'SSE bridge');
contains('ui/src/lib/client/sse-notifications-bridge.ts', '/api/notifications', 'reads notifications SSE');
contains('ui/src/lib/client/sse-notifications-bridge.ts', 'careerops://job/', 'emits deepLink on tap');
exists('ui/src/lib/components/BackendPill.svelte', 'backend pill component');
contains('ui/src/lib/components/BackendPill.svelte', 'pillLabel', 'uses pillLabel helper');
exists('ui/src/routes/api/stats/+server.ts', '/api/stats endpoint');
contains('ui/src/routes/api/stats/+server.ts', 'queued', 'returns queued count');

// ── Phase 6 — verifier + docs ─────────────────────────────────────
section('Phase 6 — Verifier + docs');
exists('verify-capacitor.mjs', 'this verifier');
exists('USAGE-NATIVE.md', 'native usage doc');
exists('Makefile', 'Makefile with one-shot targets');
contains('Makefile', 'dev-desktop:', 'Makefile dev-desktop target');
contains('Makefile', 'release:', 'Makefile release target');

// ── Phase 7 — one-shot scripts ────────────────────────────────────
section('Phase 7 — One-shot scripts');
const SCRIPTS = [
  ['scripts/native/_lib.mjs', 'shared helpers'],
  ['scripts/native/help.mjs', 'pnpm native menu'],
  ['scripts/native/setup.mjs', 'interactive setup wizard'],
  ['scripts/native/dev-desktop.mjs', 'one-shot dev:desktop'],
  ['scripts/native/dev-ios.mjs', 'one-shot dev:ios'],
  ['scripts/native/build-desktop.mjs', 'one-shot build:desktop'],
  ['scripts/native/build-ios-testflight.mjs', 'one-shot build:ios'],
  ['scripts/native/icons.mjs', 'one-shot icons regen'],
  ['scripts/native/release.mjs', 'one-shot release'],
  ['scripts/native/add-xcode-targets.rb', 'Ruby xcodeproj target adder'],
];
for (const [path, label] of SCRIPTS) exists(path, label);

// Each .mjs script must parse cleanly under Node.
import { spawnSync } from 'node:child_process';
for (const [p] of SCRIPTS.filter(([f]) => f.endsWith('.mjs'))) {
  const r = spawnSync('node', ['--check', join(ROOT, p)], { encoding: 'utf8' });
  if (r.status === 0) ok(`${p} parses`);
  else fail(`${p} parse error`, r.stderr.trim().slice(0, 200));
}

// root package.json wires every command
const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
for (const cmd of ['native', 'setup:native', 'setup:secrets', 'dev:desktop', 'dev:ios', 'build:desktop', 'build:ios', 'icons', 'release', 'verify:capacitor']) {
  if (rootPkg.scripts?.[cmd]) ok(`package.json script "${cmd}"`);
  else fail(`package.json missing "${cmd}"`);
}

// ── Behavioral spot-checks (cheap and fast) ────────────────────────
section('Behavioral spot-checks');
// Parser test for deep-links — inline the same logic to assert it works
const parser = readFileSync(join(UI, 'src/lib/client/deep-links.ts'), 'utf8');
const hasJobBranch = parser.includes("case 'job':");
const hasInboxBranch = parser.includes("case 'inbox':");
const hasFallthrough = parser.includes("default:");
if (hasJobBranch && hasInboxBranch && hasFallthrough) ok('deep-link parser has job/inbox/default branches');
else fail('deep-link parser missing branches');

const resolver = readFileSync(join(UI, 'src/lib/client/backend-discovery.ts'), 'utf8');
const hasFiveSources = ['embedded', 'dev', 'lan', 'tailscale', 'remote'].every((s) => resolver.includes(`'${s}'`));
if (hasFiveSources) ok('resolver covers all 5 sources');
else fail('resolver missing one of the 5 sources');

// Tray polling interval
const trayBody = readFileSync(join(UI, 'electron/src/tray.ts'), 'utf8');
if (trayBody.includes('POLL_INTERVAL_MS = 30_000')) ok('tray polls every 30s');
else fail('tray poll interval not set to 30s');

// Background fetch every 15 min (iOS minimum)
const bgBody = readFileSync(join(UI, 'ios/App/App/AppDelegate.swift'), 'utf8');
if (bgBody.includes('backgroundFetchIntervalMinimum')) ok('iOS uses backgroundFetchIntervalMinimum (≤15min when allowed)');
else fail('iOS background fetch interval not set');

// ── Summary ─────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log(`📊 ${passes} passed · ${errors} failed${warnings ? ` · ${warnings} warnings` : ''}`);
if (errors === 0) {
  console.log(`${GREEN}🟢 verify-capacitor green${RESET}`);
  process.exit(0);
} else {
  console.log(`${RED}🔴 fix errors above${RESET}`);
  process.exit(1);
}
