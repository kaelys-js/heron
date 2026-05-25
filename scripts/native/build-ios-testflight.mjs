#!/usr/bin/env node
/**
 * build-ios-testflight -- one-shot: build the iOS app and upload to TestFlight.
 *
 * Runs the full Fastlane :beta lane. Requires:
 *   • Xcode + CocoaPods installed (the script offers to install)
 *   • Ruby + Bundler (Apple's Ruby works; system ruby OK)
 *   • Fastlane (the script `bundle install`s it on first run)
 *   • Apple Developer secrets in ~/.heron/native-env
 *     (run `pnpm setup:native` once to generate)
 *
 * On success: build appears in TestFlight within ~5min, internal testers
 * see it immediately (no Apple beta review).
 */
import { step, run, which, ok, warn, info, UI, ROOT, NATIVE_ENV_FILE } from './_lib.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const iosDir = join(UI, 'ios', 'App');

step(1, 'Preflight');
if (!which('xcodebuild')) {
  console.error('Xcode CLI tools not found — install Xcode from the App Store');
  process.exit(1);
}
// CocoaPods is only required when the iOS project ships a Podfile.
// Capacitor 7+ uses Swift Package Manager by default -- no Podfile, no
// `pod install` needed. Detect + skip if not present.
const usesPodfile = existsSync(join(iosDir, 'Podfile'));
if (usesPodfile && !which('pod')) {
  warn('CocoaPods missing — installing now');
  run('brew', ['install', 'cocoapods'], { allowFail: true });
}
if (!which('bundle')) {
  warn('Bundler missing — installing now');
  run('gem', ['install', 'bundler', '--user-install'], { allowFail: true });
}

step(2, 'Loading signing env');
const envFile = NATIVE_ENV_FILE;
let env = {};
if (!existsSync(envFile)) {
  console.error('No Apple Developer secrets found.');
  console.error('Run `pnpm setup:native` once to configure them.');
  process.exit(1);
}
const raw = readFileSync(envFile, 'utf8');
for (const line of raw.split('\n')) {
  const m = line.match(/^export\s+([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
ok(`loaded ${Object.keys(env).length} env vars`);
for (const required of [
  'APPLE_ID',
  'APPLE_TEAM_ID',
  'APP_STORE_CONNECT_KEY_ID',
  'APP_STORE_CONNECT_ISSUER_ID',
]) {
  if (!env[required]) {
    console.error(`Missing required env var: ${required}. Re-run pnpm setup:native.`);
    process.exit(1);
  }
}

step(3, 'Applying brand (icons + configs from branding/brand.json)');
run('node', [join(ROOT, 'scripts/native/apply-brand.mjs')]);

step(4, 'Building SvelteKit (static — WebView shell)');
run('pnpm', ['build'], {
  cwd: UI,
  env: { CAPACITOR: '1', PUBLIC_CAPACITOR_BUILD: '1' },
});

step(5, 'Syncing iOS');
run('pnpm', ['exec', 'cap', 'sync', 'ios'], { cwd: UI });

// Same self-heal as dev-ios.mjs -- see comment there. xcodebuild via
// Fastlane will fail with "cannot find type" if any App/*.swift file
// isn't in the App target's compile-sources phase.
if (which('ruby') && which('gem')) {
  run('gem', ['install', 'xcodeproj', 'plist', '--user-install', '--no-document'], {
    silent: true,
    allowFail: true,
  });
  run('ruby', [join(ROOT, 'scripts', 'native', 'add-xcode-targets.rb')], {
    cwd: iosDir,
    allowFail: true,
  });
}

step(6, 'Installing CocoaPods');
run('pod', ['install', '--repo-update'], { cwd: iosDir });

step(7, 'Bundle install (Fastlane)');
run('bundle', ['install', '--quiet'], { cwd: iosDir });

step(8, 'Running Fastlane :beta -- uploading to TestFlight');
run('bundle', ['exec', 'fastlane', 'beta'], { cwd: iosDir, env });

step(9, 'Done');
ok('Build uploaded -- check TestFlight in ~5min.');
info('Internal testers see it immediately (no Apple beta review).');
