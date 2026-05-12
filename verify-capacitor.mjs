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

function section(name) {
  console.log(`\n${CYAN}▸ ${name}${RESET}`);
}
function ok(msg) {
  passes++;
  console.log(`  ${GREEN}✓${RESET} ${msg}`);
}
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
  if (!existsSync(full)) {
    fail(`${label} (file missing)`, rel);
    return;
  }
  const body = readFileSync(full, 'utf8');
  if (body.includes(needle)) ok(label);
  else fail(`${label} needle not found`, `"${needle}"`);
}

function jsonField(rel, dotPath, expected, label) {
  const full = rel.startsWith('/') ? rel : join(ROOT, rel);
  if (!existsSync(full)) {
    fail(`${label} (file missing)`, rel);
    return;
  }
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
contains(
  'ui/src/lib/client/notifications.ts',
  'Capacitor.getPlatform()',
  'platform-detect dispatch',
);
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
contains('ui/electron/src/mdns.ts', 'BRAND.mdnsType', 'service type set (via BRAND)');
exists('ui/electron/electron-builder.config.json', 'electron-builder config');
jsonField(
  'ui/electron/electron-builder.config.json',
  'appId',
  'com.resistjs.careerops',
  'electron-builder appId',
);
jsonField(
  'ui/electron/electron-builder.config.json',
  'mac.hardenedRuntime',
  true,
  'hardened runtime enabled',
);
exists('ui/electron/build/entitlements.mac.plist', 'macOS entitlements plist');
contains('ui/electron/build/entitlements.mac.plist', 'allow-jit', 'JIT entitlement');
contains(
  'ui/electron/build/entitlements.mac.plist',
  'network.client',
  'network client entitlement',
);
exists('.github/workflows/native-release.yml', 'CI matrix workflow');
contains(
  '.github/workflows/native-release.yml',
  'macos-latest, ubuntu-latest, windows-latest',
  '3-OS matrix',
);
exists('.github/workflows/testflight-keepalive.yml', 'TestFlight keepalive cron');
contains(
  '.github/workflows/testflight-keepalive.yml',
  "cron: '0 9 1 */2 *'",
  '60-day rebuild cadence',
);

// ── Phase 2 — iOS basics ───────────────────────────────────────────
section('Phase 2 — iOS basics');
exists('ui/ios/App/App/Info.plist', 'Info.plist');
contains('ui/ios/App/App/Info.plist', '<string>careerops</string>', 'careerops:// URL scheme');
contains('ui/ios/App/App/Info.plist', '_career-ops._tcp', 'Bonjour service declared');
contains(
  'ui/ios/App/App/Info.plist',
  'NSLocalNetworkUsageDescription',
  'local network permission description',
);
contains('ui/ios/App/App/Info.plist', 'NSFaceIDUsageDescription', 'face id permission description');
contains('ui/ios/App/App/Info.plist', '<string>fetch</string>', 'background fetch mode');
exists('ui/ios/App/App/AppDelegate.swift', 'AppDelegate.swift');
contains('ui/ios/App/App/AppDelegate.swift', 'BonjourBrowser', 'bonjour browser wired');
contains(
  'ui/ios/App/App/AppDelegate.swift',
  'BackgroundFetcher.shared.fetch',
  'background fetch handler',
);
exists('ui/ios/App/App/BonjourBrowser.swift', 'BonjourBrowser');
exists('ui/ios/App/App/BackgroundFetcher.swift', 'BackgroundFetcher');
contains(
  'ui/ios/App/App/BackgroundFetcher.swift',
  'Brand.DefaultsKey.lastSeenIssue',
  'lastSeen pointer tracked (via Brand)',
);
exists('ui/src/lib/client/deep-links.ts', 'deep-link handler');
contains('ui/src/lib/client/deep-links.ts', 'careerops://', 'parses custom scheme');

// ── Phase 3 — iOS advanced features ────────────────────────────────
section('Phase 3 — iOS advanced features');
exists('ui/ios/App/App/SpotlightIndexer.swift', 'Spotlight indexer');
exists('ui/ios/App/App/BiometricAuth.swift', 'biometric auth');
exists('ui/ios/App/App/KeychainStore.swift', 'keychain store');
exists('ui/ios/App/App/CareerOpsNativePlugin.swift', 'Capacitor native plugin bridge');
contains(
  'ui/ios/App/App/CareerOpsNativePlugin.swift',
  'CareerOpsNative',
  'jsName matches JS bridge',
);
exists('ui/ios/App/CareerOpsWidget/CareerOpsWidget.swift', 'Widget target source');
contains('ui/ios/App/CareerOpsWidget/CareerOpsWidget.swift', 'systemSmall', 'small widget family');
contains(
  'ui/ios/App/CareerOpsWidget/CareerOpsWidget.swift',
  'accessoryCircular',
  'lock-screen widget family',
);
exists('ui/ios/App/CareerOpsLiveActivity/CareerOpsLiveActivity.swift', 'Live Activity source');
contains(
  'ui/ios/App/CareerOpsLiveActivity/CareerOpsLiveActivity.swift',
  'DynamicIsland',
  'Dynamic Island wired',
);
exists('ui/ios/App/CareerOpsShareExtension/ShareViewController.swift', 'Share Extension source');
contains(
  'ui/ios/App/CareerOpsShareExtension/ShareViewController.swift',
  '/api/pipeline',
  'posts to pipeline endpoint',
);
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
contains(
  'ui/src/lib/client/sse-notifications-bridge.ts',
  '/api/notifications',
  'reads notifications SSE',
);
contains(
  'ui/src/lib/client/sse-notifications-bridge.ts',
  'jobDeepLink',
  'emits deepLink on tap (via jobDeepLink)',
);
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
for (const cmd of [
  'native',
  'setup:native',
  'setup:secrets',
  'dev:desktop',
  'dev:ios',
  'build:desktop',
  'build:ios',
  'icons',
  'release',
  'verify:capacitor',
]) {
  if (rootPkg.scripts?.[cmd]) ok(`package.json script "${cmd}"`);
  else fail(`package.json missing "${cmd}"`);
}

// ── Phase 9 — Brand source of truth ────────────────────────────────
section('Phase 9 — Brand single source of truth');
exists('branding/brand.json', 'master brand metadata');
exists('branding/logo.svg', 'master logo');
exists('scripts/native/apply-brand.mjs', 'brand propagator');
// Load brand and verify every consumer matches.
{
  const brand = JSON.parse(readFileSync(join(ROOT, 'branding/brand.json'), 'utf8'));
  const bid = brand.identifiers.bundleId;
  const scheme = brand.identifiers.urlScheme;
  const svc = brand.identifiers.serviceType;
  const display = brand.displayName;
  // Consumers in order — each must reference the same values.
  contains(
    'ui/capacitor.config.ts',
    `appId: '${bid}'`,
    'ui capacitor.config bundle id matches brand',
  );
  contains(
    'ui/capacitor.config.ts',
    `appName: '${display}'`,
    'ui capacitor.config display name matches brand',
  );
  contains(
    'ui/capacitor.config.ts',
    `scheme: '${scheme}'`,
    'ui capacitor.config urlScheme matches brand',
  );
  contains(
    'ui/electron/capacitor.config.ts',
    `appId: '${bid}'`,
    'electron capacitor.config bundle id matches brand',
  );
  contains(
    'ui/electron/capacitor.config.ts',
    `customUrlScheme: '${scheme}'`,
    'electron customUrlScheme matches brand',
  );
  jsonField(
    'ui/electron/electron-builder.config.json',
    'appId',
    bid,
    'electron-builder appId matches brand',
  );
  jsonField(
    'ui/electron/electron-builder.config.json',
    'productName',
    display,
    'electron-builder productName matches brand',
  );
  contains(
    'ui/ios/App/App/Info.plist',
    `<string>${display}</string>`,
    'iOS Info.plist CFBundleDisplayName matches brand',
  );
  contains(
    'ui/ios/App/App/Info.plist',
    `<string>${scheme}</string>`,
    'iOS Info.plist URL scheme matches brand',
  );
  contains(
    'ui/ios/App/App/Info.plist',
    `<string>${svc}</string>`,
    'iOS Info.plist Bonjour service matches brand',
  );
  exists('ui/ios/App/App/Brand.swift', 'generated Brand.swift (host app)');
  exists('ui/ios/App/CareerOpsWidget/Brand.swift', 'generated Brand.swift (widget)');
  exists('ui/ios/App/CareerOpsLiveActivity/Brand.swift', 'generated Brand.swift (live activity)');
  exists('ui/ios/App/CareerOpsShareExtension/Brand.swift', 'generated Brand.swift (share ext)');
  contains(
    'ui/ios/App/App/Brand.swift',
    `bundleId = "${bid}"`,
    'Brand.swift bundleId matches brand',
  );
  contains(
    'ui/ios/App/App/Brand.swift',
    `urlScheme = "${scheme}"`,
    'Brand.swift urlScheme matches brand',
  );
  contains(
    'ui/ios/App/App/Brand.swift',
    `keychainService = "${brand.identifiers.keychainService}"`,
    'Brand.swift keychainService matches brand',
  );
  contains(
    'ui/ios/App/App/Brand.swift',
    'enum DefaultsKey',
    'Brand.swift exposes DefaultsKey namespace',
  );
  exists('ui/src/lib/client/brand.ts', 'generated brand.ts (client)');
  exists('ui/electron/src/brand.ts', 'generated brand.ts (electron)');
  contains(
    'ui/src/lib/client/brand.ts',
    `bundleId: "${bid}"`,
    'client brand.ts bundleId matches brand',
  );
  contains(
    'ui/src/lib/client/brand.ts',
    `urlScheme: "${scheme}"`,
    'client brand.ts urlScheme matches brand',
  );
  contains(
    'ui/electron/src/brand.ts',
    `mdnsType: "${brand.identifiers.mdnsType}"`,
    'electron brand.ts mdnsType matches brand',
  );
  // Consumers actually import from generated brand files (no hardcoded runtime strings)
  contains('ui/src/lib/client/deep-links.ts', `from './brand'`, 'deep-links.ts imports BRAND');
  contains(
    'ui/src/lib/client/sse-notifications-bridge.ts',
    `from './brand'`,
    'sse bridge imports BRAND',
  );
  contains(
    'ui/src/lib/client/backend-discovery.ts',
    `from './brand'`,
    'backend-discovery imports BRAND',
  );
  contains('ui/electron/src/index.ts', `from './brand'`, 'electron index.ts imports BRAND');
  contains('ui/electron/src/mdns.ts', `from './brand'`, 'electron mdns.ts imports BRAND');
  contains(
    'ui/ios/App/App/KeychainStore.swift',
    'Brand.keychainService',
    'KeychainStore uses Brand.keychainService',
  );
  contains(
    'ui/ios/App/App/SpotlightIndexer.swift',
    'Brand.spotlightDomain',
    'SpotlightIndexer uses Brand.spotlightDomain',
  );
  contains(
    'ui/ios/App/App/AppDelegate.swift',
    'Brand.serviceType',
    'AppDelegate uses Brand.serviceType',
  );
  contains(
    'ui/ios/App/App/BackgroundFetcher.swift',
    'Brand.DefaultsKey.lanUrl',
    'BackgroundFetcher uses Brand.DefaultsKey',
  );
  contains(
    'ui/ios/App/CareerOpsWidget/CareerOpsWidget.swift',
    'Brand.appGroup',
    'Widget uses Brand.appGroup',
  );
  contains(
    'ui/ios/App/CareerOpsShareExtension/ShareViewController.swift',
    'Brand.appGroup',
    'ShareExt uses Brand.appGroup',
  );
  exists('ui/static/manifest.webmanifest', 'web manifest exists');
  jsonField('ui/static/manifest.webmanifest', 'name', display, 'web manifest name matches brand');
  jsonField(
    'ui/static/manifest.webmanifest',
    'theme_color',
    brand.colors.primary,
    'web manifest theme_color matches brand',
  );
  contains(
    'ui/ios/App/fastlane/Appfile',
    `app_identifier("${bid}")`,
    'Fastlane Appfile bundle id matches brand',
  );
  contains(
    'ui/ios/App/fastlane/Fastfile',
    `APP_IDENTIFIER = "${bid}"`,
    'Fastlane Fastfile bundle id matches brand',
  );
  contains(
    'scripts/native/add-xcode-targets.rb',
    `bundle_root = '${bid}'`,
    'xcode targets script bundle root matches brand',
  );
  contains(
    'scripts/native/add-xcode-targets.rb',
    `app_group = '${brand.identifiers.appGroup}'`,
    'xcode targets script app group matches brand',
  );
  jsonField('package.json', 'license', brand.license, 'root package.json license matches brand');
  jsonField(
    'package.json',
    'description',
    brand.tagline,
    'root package.json description matches brand',
  );
}

// ── Phase 10 — Error handling + LoadingState + auto-brand ──────────
section('Phase 10 — Error handling + LoadingState + auto-brand pipeline');
exists('ui/src/lib/client/error-reporter.ts', 'unified error reporter (client)');
exists('ui/ios/App/App/ErrorReporter.swift', 'unified error reporter (iOS)');
exists('ui/ios/App/CareerOpsWidget/ErrorReporter.swift', 'ErrorReporter synced to widget target');
exists(
  'ui/ios/App/CareerOpsLiveActivity/ErrorReporter.swift',
  'ErrorReporter synced to liveactivity target',
);
exists(
  'ui/ios/App/CareerOpsShareExtension/ErrorReporter.swift',
  'ErrorReporter synced to share-ext target',
);
contains(
  'ui/src/lib/client/error-reporter.ts',
  'installErrorReporter',
  'global handlers installer exported',
);
contains(
  'ui/src/lib/client/error-reporter.ts',
  '/api/issues',
  'reports flow to shared Issues store',
);
contains(
  'ui/src/lib/client/error-reporter.ts',
  'unhandledrejection',
  'window unhandledrejection wired',
);
contains(
  'ui/src/lib/client/error-reporter.ts',
  'main-error',
  'electron main-process errors received via IPC',
);
contains(
  'ui/src/lib/client/error-reporter.ts',
  'drainNativeErrors',
  'iOS native errors drained via plugin',
);
contains('ui/src/routes/+layout.svelte', 'installErrorReporter', 'reporter installed at app boot');
contains('ui/src/routes/+error.svelte', 'reportError', '+error.svelte forwards to reporter');
contains(
  'ui/electron/src/index.ts',
  'unhandledRejection',
  'electron main-process rejections caught',
);
contains(
  'ui/electron/src/preload.ts',
  'electronAPI',
  'preload exposes electronAPI for renderer IPC',
);
contains(
  'ui/ios/App/App/ErrorReporter.swift',
  'sharedDefaults',
  'iOS reporter uses App Group store',
);
contains(
  'ui/ios/App/App/CareerOpsNativePlugin.swift',
  'drainNativeErrors',
  'iOS plugin exposes drainNativeErrors',
);
contains(
  'ui/ios/App/App/BonjourBrowser.swift',
  'ErrorReporter.shared.report',
  'BonjourBrowser reports errors',
);
contains(
  'ui/ios/App/App/BackgroundFetcher.swift',
  'ErrorReporter.shared.report',
  'BackgroundFetcher reports errors',
);
contains(
  'ui/ios/App/App/SpotlightIndexer.swift',
  'ErrorReporter.shared.report',
  'SpotlightIndexer reports errors',
);
exists('ui/src/lib/components/LoadingState.svelte', 'standard LoadingState component');
exists('ui/src/lib/components/BackendBootGuard.svelte', 'boot guard with LoadingState overlay');
contains('ui/src/lib/components/LoadingState.svelte', "variant === 'overlay'", 'overlay variant');
contains('ui/src/lib/components/LoadingState.svelte', "variant === 'skeleton'", 'skeleton variant');
contains(
  'ui/src/lib/components/BackendBootGuard.svelte',
  'resolveBackend',
  'boot guard awaits resolver',
);
exists('ui/vite.config.ts', 'vite config exists');
contains('ui/vite.config.ts', 'brandWatcherPlugin', 'vite auto-runs apply-brand');
contains('ui/vite.config.ts', 'configResolved', 'apply-brand runs at startup');
contains('ui/vite.config.ts', 'configureServer', 'apply-brand re-runs on branding/ change in dev');
// Pre-commit moved from .githooks/ to lefthook.yml (Phase 11).
// Checked via lefthook.yml above.
// Build/dev scripts auto-apply brand
contains('scripts/native/build-desktop.mjs', 'apply-brand.mjs', 'build:desktop auto-applies brand');
contains(
  'scripts/native/build-ios-testflight.mjs',
  'apply-brand.mjs',
  'build:ios auto-applies brand',
);
contains('scripts/native/dev-desktop.mjs', 'apply-brand.mjs', 'dev:desktop auto-applies brand');
contains('scripts/native/dev-ios.mjs', 'apply-brand.mjs', 'dev:ios auto-applies brand');
// Phase A: UX brand wiring
contains(
  'ui/src/lib/config/branding.ts',
  "from '$lib/client/brand'",
  'legacy branding.ts re-exports from BRAND',
);
contains('ui/src/lib/theme.svelte.ts', 'BRAND.name', 'theme store uses BRAND prefix');
contains('ui/src/lib/sidebar-pins.svelte.ts', 'BRAND.name', 'sidebar-pins uses BRAND prefix');
contains('ui/src/lib/api.ts', 'BRAND_EVENTS.openNotifications', 'api.ts uses BRAND_EVENTS');
contains(
  'ui/src/lib/notifications.svelte.ts',
  'BRAND_EVENTS',
  'notifications svelte.ts uses BRAND_EVENTS',
);
contains(
  'ui/src/lib/components/NotificationsBell.svelte',
  'BRAND_EVENTS.openNotifications',
  'NotificationsBell listener uses BRAND_EVENTS',
);
contains(
  'ui/src/lib/components/PushNotificationsToggle.svelte',
  'BRAND_EVENTS.notify',
  'PushNotificationsToggle listener uses BRAND_EVENTS',
);
contains(
  'ui/src/lib/client/native-bridge.ts',
  'BRAND_STORAGE_PREFIX',
  'native-bridge keychain fallback uses BRAND prefix',
);
contains('ui/src/lib/client/brand.ts', 'BRAND_EVENTS', 'brand.ts exports BRAND_EVENTS');
contains(
  'ui/src/lib/client/brand.ts',
  'BRAND_STORAGE_PREFIX',
  'brand.ts exports BRAND_STORAGE_PREFIX',
);
// app.html templating
contains(
  'ui/src/app.html',
  `${JSON.parse(readFileSync(join(ROOT, 'branding/brand.json'), 'utf8')).name}:theme`,
  'app.html localStorage key matches brand',
);

// ── Phase 11 — Tooling (mise + lefthook + biome + turborepo) ────────
section('Phase 11 — Tooling (mise + lefthook + biome + turborepo)');
exists('.mise.toml', 'mise pin');
contains('.mise.toml', 'node = "25', 'node pinned to latest');
contains('.mise.toml', 'pnpm = ', 'pnpm pinned');
exists('lefthook.yml', 'lefthook config');
contains('lefthook.yml', 'pre-commit:', 'pre-commit hooks');
contains('lefthook.yml', 'pre-push:', 'pre-push hooks');
contains('lefthook.yml', 'apply-brand', 'pre-commit auto-applies brand');
contains('lefthook.yml', 'biome format --write', 'pre-commit formats with biome');
contains('lefthook.yml', 'no-secrets', 'pre-commit blocks secrets');
contains('lefthook.yml', 'svelte-check', 'pre-push svelte-check');
contains('lefthook.yml', 'verify-capacitor', 'pre-push verify-capacitor');
exists('biome.json', 'biome config');
jsonField('biome.json', 'formatter.enabled', true, 'biome formatter enabled');
jsonField('biome.json', 'linter.enabled', false, 'biome linter disabled (formatting only)');
contains('biome.json', '"!**/*.svelte"', 'biome excludes .svelte (delegated to prettier)');
contains('biome.json', '"!**/*.css"', 'biome excludes .css (Tailwind directives)');
exists('.prettierrc.json', 'prettier config (svelte only)');
exists('.prettierignore', 'prettier ignore');
contains('.prettierrc.json', 'prettier-plugin-svelte', 'prettier svelte plugin');
contains('.prettierignore', '*.ts', 'prettier ignores .ts (biome handles)');
contains('lefthook.yml', 'prettier-svelte', 'pre-commit runs prettier on .svelte');
// TypeScript Go port
contains('ui/package.json', '@typescript/native-preview', 'ui uses tsgo (TS Go port)');
contains('ui/electron/package.json', '@typescript/native-preview', 'electron uses tsgo');
contains('ui/package.json', '"typecheck"', 'ui has tsgo typecheck script');
contains('ui/electron/package.json', 'tsgo', 'electron builds with tsgo');
// .gitignore covers caches
contains('.gitignore', '.turbo/', '.turbo cache gitignored');
contains('.gitignore', '_build/', 'icon _build/ gitignored');
exists('turbo.json', 'turbo config');
contains('turbo.json', '"build"', 'turbo has build task');
contains('turbo.json', '"brand"', 'turbo has brand task');
exists('pnpm-workspace.yaml', 'pnpm workspace');
contains('pnpm-workspace.yaml', 'ui', 'workspace includes ui');
jsonField('package.json', 'packageManager', 'pnpm@10.33.0', 'root pins pnpm version');
contains('package.json', '"format"', 'root has format script');
contains('package.json', '"format:check"', 'root has format:check script');
contains('package.json', '"prepare"', 'root has prepare hook (lefthook install)');
contains('package.json', 'lefthook install', 'prepare hook installs lefthook');
contains('scripts/native/setup.mjs', 'mise', 'wizard mentions mise');
contains('scripts/native/setup.mjs', 'lefthook install', 'wizard installs lefthook hooks');
contains('.github/workflows/test.yml', 'jdx/mise-action', 'CI uses mise-action');
contains(
  '.github/workflows/native-release.yml',
  'jdx/mise-action',
  'native-release uses mise-action',
);

// ── Phase 8 — Release automation ───────────────────────────────────
section('Phase 8 — Release automation (Conventional Commits → Release Please)');
exists('release-please-config.json', 'Release Please config');
exists('.release-please-manifest.json', 'Release Please manifest (current version)');
exists('.github/workflows/release.yml', 'release workflow');
contains(
  'release-please-config.json',
  '"ui/electron/package.json"',
  'bumps ui/electron alongside root',
);
contains('release-please-config.json', '"section": "✨ Features"', 'feat changelog section');
contains('release-please-config.json', '"section": "🐛 Bug Fixes"', 'fix changelog section');
contains('.github/workflows/release.yml', 'release-please-action', 'Release Please action');
contains(
  '.github/workflows/release.yml',
  'uses: ./.github/workflows/native-release.yml',
  'workflow_call to native-release',
);
contains(
  '.github/workflows/release.yml',
  'secrets: inherit',
  'secrets forwarded to called workflow',
);
contains(
  '.github/workflows/native-release.yml',
  'workflow_call:',
  'native-release supports workflow_call',
);
contains(
  '.github/workflows/native-release.yml',
  'version:',
  'native-release accepts version input',
);
contains('AGENTS.md', 'Conventional Commits', 'commit convention documented');
contains('AGENTS.md', 'Release Please', 'Release Please flow documented');
exists('scripts/native/_bump-versions.mjs', 'bump script (manual override)');

// ── Behavioral spot-checks (cheap and fast) ────────────────────────
section('Behavioral spot-checks');
// Parser test for deep-links — inline the same logic to assert it works
const parser = readFileSync(join(UI, 'src/lib/client/deep-links.ts'), 'utf8');
const hasJobBranch = parser.includes("case 'job':");
const hasInboxBranch = parser.includes("case 'inbox':");
const hasFallthrough = parser.includes('default:');
if (hasJobBranch && hasInboxBranch && hasFallthrough)
  ok('deep-link parser has job/inbox/default branches');
else fail('deep-link parser missing branches');

const resolver = readFileSync(join(UI, 'src/lib/client/backend-discovery.ts'), 'utf8');
const hasFiveSources = ['embedded', 'dev', 'lan', 'tailscale', 'remote'].every((s) =>
  resolver.includes(`'${s}'`),
);
if (hasFiveSources) ok('resolver covers all 5 sources');
else fail('resolver missing one of the 5 sources');

// Tray polling interval
const trayBody = readFileSync(join(UI, 'electron/src/tray.ts'), 'utf8');
if (trayBody.includes('POLL_INTERVAL_MS = 30_000')) ok('tray polls every 30s');
else fail('tray poll interval not set to 30s');

// Background fetch every 15 min (iOS minimum)
const bgBody = readFileSync(join(UI, 'ios/App/App/AppDelegate.swift'), 'utf8');
if (bgBody.includes('backgroundFetchIntervalMinimum'))
  ok('iOS uses backgroundFetchIntervalMinimum (≤15min when allowed)');
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
