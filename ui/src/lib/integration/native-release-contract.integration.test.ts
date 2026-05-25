/**
 * Native-release signing/secret CONTRACT test (TDD spine).
 *
 * Locks the chain producer (setup.mjs) -> GitHub secrets -> consumer
 * (native-release.yml) -> tools (Fastfiles, build.gradle) -> checker
 * (doctor.mjs): every sign/upload secret must flow through all layers with
 * consistent names/encoding, the required signing steps must exist, and
 * dead/phantom secrets must be gone. Exists because a prior wiring shipped
 * broken on every platform with no test to catch it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

const workflow = read('.github/workflows/native-release.yml');
const setup = read('scripts/native/setup.mjs');
const doctor = read('scripts/native/doctor.mjs');
const iosFastfile = read('ui/ios/App/fastlane/Fastfile');
const buildGradle = read('ui/android/app/build.gradle');

// Apple signing secrets that MUST flow producer -> checker -> consumer.
const APPLE_SIGNING = [
  'APPLE_TEAM_ID',
  'MAC_CERTIFICATE',
  'MAC_CERTIFICATE_PASSWORD',
  'APP_STORE_CONNECT_KEY_ID',
  'APP_STORE_CONNECT_ISSUER_ID',
  'APP_STORE_CONNECT_PRIVATE_KEY',
  'MATCH_GIT_URL',
  'MATCH_PASSWORD',
];
// Manual-signing relics that `match` replaces -- must no longer appear.
const PHANTOM = ['IOS_CERTIFICATE', 'IOS_CERTIFICATE_PASSWORD', 'IOS_PROVISIONING_PROFILE'];
const ANDROID_SIGNING = [
  'PLAY_STORE_JSON_KEY',
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

describe('native-release contract — Apple signing chain', () => {
  it.each(APPLE_SIGNING)('%s is produced by setup.mjs', (s) => {
    expect(setup, `${s} not produced by setup.mjs`).toContain(s);
  });
  it.each(APPLE_SIGNING)('%s is checked by doctor.mjs', (s) => {
    expect(doctor, `${s} not in doctor requiredSecrets`).toContain(s);
  });
  it.each(APPLE_SIGNING)('%s is consumed by native-release.yml', (s) => {
    expect(workflow, `${s} not consumed by native-release.yml`).toContain(s);
  });
});

describe('native-release contract — no phantom secrets', () => {
  it.each(PHANTOM)('%s gone from doctor.mjs', (s) => {
    expect(doctor, `${s} required by doctor but nothing produces it`).not.toContain(s);
  });
  it.each(PHANTOM)('%s gone from native-release.yml', (s) => {
    expect(workflow, `${s} passed in workflow but nothing produces/uses it`).not.toContain(s);
  });
});

describe('native-release contract — Android signing engages', () => {
  it('build.gradle gates release signing on keystore.properties', () => {
    expect(buildGradle).toMatch(/keystore\.properties/);
  });
  it('native-release.yml writes keystore.properties (else AAB ships debug-signed)', () => {
    expect(workflow, 'build-android never creates keystore.properties').toMatch(
      /keystore\.properties/,
    );
  });
  it('setup.mjs writes a local keystore.properties', () => {
    expect(setup).toMatch(/keystore\.properties/);
  });
  it.each(ANDROID_SIGNING)('%s flows setup -> workflow', (s) => {
    expect(setup, `${s} not produced by setup.mjs`).toContain(s);
    expect(workflow, `${s} not consumed by native-release.yml`).toContain(s);
  });
});

describe('native-release contract — iOS signing via match', () => {
  it('iOS Fastfile invokes match()', () => {
    expect(iosFastfile, 'no match() call -> build-ios has no signing identity').toMatch(
      /\bmatch\(/,
    );
  });
  it('ASC API key decoded from base64 (is_key_content_base64)', () => {
    expect(iosFastfile).toContain('is_key_content_base64');
  });
});

describe('native-release contract — macOS notarize key is a path, not base64', () => {
  it('electron notarize does not feed the base64 secret straight to APPLE_API_KEY', () => {
    expect(
      workflow,
      'notarize APPLE_API_KEY gets base64 .p8 content; notarytool needs a file path',
    ).not.toMatch(/APPLE_API_KEY:\s*\$\{\{\s*secrets\.APP_STORE_CONNECT_PRIVATE_KEY/);
  });
});

describe('native-release contract — no dead pushed secret', () => {
  it('PLAY_STORE_PACKAGE_NAME is dropped (Fastfile uses the constant)', () => {
    expect(setup, 'PLAY_STORE_PACKAGE_NAME is dead -- drop it').not.toContain(
      'PLAY_STORE_PACKAGE_NAME',
    );
  });
});
