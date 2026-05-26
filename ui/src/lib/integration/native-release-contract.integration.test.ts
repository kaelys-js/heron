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
const applyBrand = read('scripts/native/apply-brand.mjs');
const brand = JSON.parse(read('branding/brand.json'));
const privacyManifest = read('ui/ios/App/App/PrivacyInfo.xcprivacy');

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
  // Repo-scoped SSH deploy key so CI can clone the private match certs repo.
  'MATCH_GIT_PRIVATE_KEY',
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

describe('native-release contract — store version derives from package.json', () => {
  it('iOS injects MARKETING_VERSION from package.json (not a drifted pbxproj literal)', () => {
    expect(iosFastfile, 'release build must override MARKETING_VERSION').toContain(
      'MARKETING_VERSION=',
    );
    expect(iosFastfile, 'marketing_version must read package.json $.version').toMatch(
      /package\.json/,
    );
  });
  it('Android versionName derives from package.json $.version', () => {
    expect(buildGradle, 'versionName must read package.json, not a literal').toMatch(
      /package\.json/,
    );
  });
});

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
  it('bootstrap auto-registers missing App IDs + App Groups (match never creates them)', () => {
    expect(iosFastfile, 'match_bootstrap must register App IDs first').toContain(
      'register_app_ids',
    );
    expect(iosFastfile, 'extension App IDs need App Groups enabled').toContain(
      'create_capability("APP_GROUPS")',
    );
  });
});

describe('native-release contract — App Store privacy label + age rating (#4D)', () => {
  it('ITSAppUsesNonExemptEncryption derives from brand export-compliance', () => {
    expect(applyBrand, 'apply-brand must derive the encryption flag').toContain(
      'ITSAppUsesNonExemptEncryption',
    );
    expect(applyBrand).toContain('exportComplianceEncryptionExempt');
  });

  it('the lane uses the ASC age-rating + data-usage + publish endpoints', () => {
    expect(iosFastfile).toContain('set_privacy_and_age_rating');
    expect(iosFastfile, 'age rating via patch_age_rating_declaration').toContain(
      'patch_age_rating_declaration',
    );
    expect(iosFastfile, 'privacy via AppDataUsage').toContain('AppDataUsage');
    expect(iosFastfile, 'must publish the data usages').toContain(
      'patch_app_data_usages_publish_state',
    );
    expect(iosFastfile, 'age + privacy derive from brand.json').toContain('brand_app_store');
  });

  it('age rating derives from brand contentRating (4+)', () => {
    expect(brand.store.appStore.contentRating).toBe('4+');
  });

  it('the ASC privacy label MUST match PrivacyInfo.xcprivacy', () => {
    // The two declarations Apple cross-checks: the brand-derived nutrition
    // label and the on-device privacy manifest must agree on what is collected.
    const categories = brand.store.appStore.privacy.dataTypes.map(
      (t: { category: string }) => t.category,
    );
    expect(categories).toContain('EMAIL_ADDRESS');
    expect(categories).toContain('CRASH_DATA');
    expect(privacyManifest, 'manifest declares email').toContain(
      'NSPrivacyCollectedDataTypeEmailAddress',
    );
    expect(privacyManifest, 'manifest declares crash').toContain(
      'NSPrivacyCollectedDataTypeCrashData',
    );
    // Neither declaration may mark data as used for tracking.
    expect(privacyManifest).toContain('<key>NSPrivacyTracking</key>');
    const tracked = brand.store.appStore.privacy.dataTypes.some(
      (t: { protection: string }) => t.protection === 'DATA_USED_TO_TRACK_YOU',
    );
    expect(tracked, 'brand privacy must not declare tracking').toBe(false);
  });
});

describe('native-release contract — TestFlight internal delivery invites the maintainer', () => {
  it('APPLE_ID flows setup -> workflow so the lane has someone to invite', () => {
    expect(setup, 'APPLE_ID not produced by setup.mjs').toContain('APPLE_ID');
    // Without this the build-ios lane sees ENV["APPLE_ID"] empty and logs
    // "already covers " (empty) -- the maintainer is never added to the group.
    expect(workflow, 'APPLE_ID never passed into build-ios').toMatch(
      /APPLE_ID:\s*\$\{\{\s*secrets\.APPLE_ID\s*\}\}/,
    );
  });
  it('ensure_internal_delivery POSTs to the version-prefixed betaGroups path', () => {
    // Unprefixed "betaGroups" returns "does not match a defined resource type";
    // spaceship's request client requires the v1 API-version prefix.
    expect(iosFastfile, 'betaGroups POST must carry the v1 prefix').toContain('v1/betaGroups');
  });
  it('the delivery lane reads APPLE_ID to add the account holder', () => {
    expect(iosFastfile).toContain('ensure_internal_delivery');
    expect(iosFastfile, 'lane must read APPLE_ID').toMatch(/ENV\["APPLE_ID"\]/);
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

describe('native-release contract — App Store metadata derives from brand.json', () => {
  const brand = JSON.parse(read('branding/brand.json'));
  const a = brand.store.appStore;
  const md = (rel: string) => read(`ui/ios/App/fastlane/metadata/${rel}`).trim();
  it('name = brand displayName', () => {
    expect(md('en-US/name.txt')).toBe(brand.displayName);
  });
  it('subtitle = brand + within Apple 30-char cap', () => {
    expect(md('en-US/subtitle.txt')).toBe(a.subtitle);
    expect(md('en-US/subtitle.txt').length).toBeLessThanOrEqual(30);
  });
  it('keywords = brand + within Apple 100-char cap', () => {
    expect(md('en-US/keywords.txt')).toBe(a.keywords);
    expect(md('en-US/keywords.txt').length).toBeLessThanOrEqual(100);
  });
  it('privacy + support URLs point at the brand domain', () => {
    expect(md('en-US/privacy_url.txt')).toBe(brand.privacyPolicyUrl);
    expect(md('en-US/support_url.txt')).toContain(brand.homepageUrl.replace(/\/$/, ''));
  });
  it('categories + review email derive from brand', () => {
    expect(md('primary_category.txt')).toBe(a.primaryCategory);
    expect(md('secondary_category.txt')).toBe(a.secondaryCategory);
    expect(md('review_information/email_address.txt')).toBe(brand.supportEmail);
  });
});
