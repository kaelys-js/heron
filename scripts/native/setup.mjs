#!/usr/bin/env node
/**
 * setup -- one-shot interactive wizard for native-app readiness.
 *
 * Walks you through ALL the one-time setup so you never have to read
 * docs/NATIVE.md. Run once; every future native command just works.
 *
 * What it does:
 *
 *   1. Check + install missing tooling (gh, cocoapods, bundler, fastlane).
 *   2. Detect your Apple Developer credentials:
 *      - APPLE_ID + APPLE_TEAM_ID (you paste)
 *      - APPLE_APP_SPECIFIC_PASSWORD (opens appleid.apple.com → you paste)
 *      - APP_STORE_CONNECT_KEY_ID + ISSUER_ID + .p8 file path
 *        (opens appstoreconnect.apple.com → you paste/select file)
 *   3. Export your Mac code-signing certificate from the Keychain to a
 *      .p12 file (you pick the cert + export password).
 *   4. Save everything locally to ~/.heron/native-env (chmod 600).
 *   5. Push the same values to GitHub Secrets via `gh secret set` so CI
 *      can sign builds when you `pnpm release`.
 *   6. Add the iOS Xcode targets (Widget, LiveActivity, ShareExt) via
 *      ruby-xcodeproj.
 *   7. Print a "you're done" summary.
 *
 * Safe to re-run -- it skips steps that are already complete and only
 * re-prompts for values that are missing or stale.
 */
import {
  step,
  run,
  capture,
  which,
  ok,
  warn,
  fail,
  info,
  ask,
  confirm,
  readState,
  writeState,
  openUrl,
  c,
  ROOT,
  UI,
  NATIVE_ENV_FILE,
  NATIVE_STATE_DIR,
} from './_lib.mjs';
import {
  existsSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  mkdtempSync,
} from 'node:fs';
import { join, join as joinPath } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

console.log(c.bold('\nheron native — interactive setup\n'));
info('Run this once. Every future native command just works.');
info('Press Ctrl+C anytime — your progress is saved.\n');

const state = readState();
const envFile = NATIVE_ENV_FILE;

// ───────────────────────────────────────────────────────────────────
step(-1, 'Activating git hooks via lefthook');
try {
  const { execSync } = await import('node:child_process');
  if (!which('lefthook')) {
    info('Installing lefthook via brew…');
    execSync('brew install lefthook', { stdio: 'inherit' });
  }
  execSync('lefthook install', { stdio: 'pipe', cwd: ROOT });
  ok(
    'lefthook installed → pre-commit (apply-brand + biome format + secret guard) + pre-push (svelte-check + verify-capacitor + verify-pipeline)',
  );
} catch (e) {
  warn(`lefthook activation skipped: ${e.message}`);
}

// ───────────────────────────────────────────────────────────────────
step(0, 'Applying brand');
try {
  const { execSync } = await import('node:child_process');
  execSync(`node "${join(ROOT, 'scripts/native/apply-brand.mjs')}"`, { stdio: 'pipe' });
  ok('branding propagated to every consumer (branding/brand.json → configs)');
} catch (e) {
  warn(`brand apply failed — continuing: ${e.message}`);
}

// ───────────────────────────────────────────────────────────────────
step(1, 'Tooling check');
const toolStatus = {
  mise: which('mise'),
  gh: which('gh'),
  brew: which('brew'),
  lefthook: which('lefthook'),
  xcodebuild: which('xcodebuild'),
  pod: which('pod'),
  bundle: which('bundle'),
  ruby: which('ruby'),
  security: which('security'),
};
for (const [t, ok_] of Object.entries(toolStatus)) {
  (ok_ ? ok : warn)(`${t} ${ok_ ? '' : '— missing'}`);
}

if (!toolStatus.brew) {
  fail('Homebrew is required to install missing tools.');
  info('Install: https://brew.sh');
  process.exit(1);
}
if (!toolStatus.xcodebuild) {
  fail('Xcode is required (full Xcode, not just CLI Tools).');
  info('Install from the Mac App Store, then re-run.');
  process.exit(1);
}

if (!toolStatus.mise) {
  if (await confirm('Install mise now? (auto-manages Node/pnpm versions per .mise.toml)')) {
    run('brew', ['install', 'mise']);
    info('Add this to your shell config (~/.zshrc or ~/.bashrc):');
    info('  eval "$(mise activate zsh)"   # zsh');
    info('  eval "$(mise activate bash)"  # bash');
    info('Then restart your shell and re-run this wizard.');
  }
} else {
  // Auto-trust the repo so `mise current` works without a manual prompt.
  run('mise', ['trust', ROOT], { allowFail: true });
  run('mise', ['install'], { cwd: ROOT, allowFail: true });
  ok('mise: versions installed from .mise.toml');
}
if (!toolStatus.lefthook) {
  if (await confirm('Install lefthook now? (git hooks manager)')) {
    run('brew', ['install', 'lefthook']);
  }
}
if (toolStatus.lefthook || which('lefthook')) {
  run('lefthook', ['install'], { cwd: ROOT, allowFail: true });
  ok('lefthook: pre-commit + pre-push hooks installed');
}
if (!toolStatus.gh) {
  if (await confirm('Install gh CLI now?')) {
    run('brew', ['install', 'gh']);
  }
}
if (!toolStatus.pod) {
  if (await confirm('Install CocoaPods now?')) {
    run('brew', ['install', 'cocoapods']);
  }
}
if (!toolStatus.bundle) {
  if (await confirm('Install Bundler (Ruby) now?')) {
    run('gem', ['install', 'bundler', '--user-install']);
  }
}
ok('Tooling ready');

// ───────────────────────────────────────────────────────────────────
step(2, 'GitHub CLI auth');
let ghOk = false;
try {
  const auth = capture('gh', ['auth', 'status'], { allowFail: true });
  if (auth.includes('Logged in')) {
    ghOk = true;
    ok('gh authenticated');
  }
} catch {}
if (!ghOk) {
  info('Launching gh auth login — pick GitHub.com → HTTPS → browser');
  run('gh', ['auth', 'login']);
}

// Verify repo + scopes
const repo = capture('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
  allowFail: true,
});
if (!repo) {
  fail('Not in a GitHub-tracked repo OR gh repo view failed.');
  info('Run this from the Heron repo root.');
  process.exit(1);
}
ok(`repo: ${repo}`);

// ───────────────────────────────────────────────────────────────────
step(3, 'Apple Developer identifiers');
state.apple = state.apple || {};

info("Two things must already exist in Apple's portal first (Apple has no API for them):");
info('  - App ID: developer.apple.com/account/resources/identifiers (Explicit; the');
info('    bundleId from branding/brand.json; enable Push Notifications, App Groups,');
info('    Associated Domains)');
info('  - App Store Connect app: appstoreconnect.apple.com -> Apps -> + (pick that bundle');
info('    ID; the store Name is globally unique, so append a descriptor if "Heron" is');
info('    taken -- the home-screen name stays Heron)');
info('  Run `pnpm doctor:native` anytime for the full checklist. Skip if already done.');

state.apple.APPLE_ID = await ask('Apple ID email', { default: state.apple.APPLE_ID });
state.apple.APPLE_TEAM_ID = await ask(
  'Apple Team ID (10 chars, from developer.apple.com → Membership)',
  { default: state.apple.APPLE_TEAM_ID },
);
writeState(state);

// ───────────────────────────────────────────────────────────────────
step(4, 'App-specific password');
if (state.apple.APPLE_APP_SPECIFIC_PASSWORD && (await confirm('  Re-use stored value?', true))) {
  ok('using stored value');
} else {
  info(
    'Generate one at https://appleid.apple.com → "Sign-In and Security" → "App-Specific Passwords".',
  );
  info('Name it: "heron CI"');
  if (await confirm('  Open the page now?', true)) {
    openUrl('https://appleid.apple.com/account/manage');
  }
  state.apple.APPLE_APP_SPECIFIC_PASSWORD = await ask('Paste the app-specific password', {
    hidden: true,
  });
  writeState(state);
}

// ───────────────────────────────────────────────────────────────────
step(5, 'App Store Connect API key');
if (
  state.apple.APP_STORE_CONNECT_KEY_ID &&
  state.apple.APP_STORE_CONNECT_KEY &&
  (await confirm('  Re-use stored API key?', true))
) {
  ok('using stored API key');
} else {
  info(
    'Create a key at https://appstoreconnect.apple.com → "Users and Access" → "Integrations" → "App Store Connect API" → "+"',
  );
  info('Access: "App Manager". Name: "heron CI"');
  info('After clicking Generate, download the .p8 file IMMEDIATELY — Apple shows it only once.');
  if (await confirm('  Open App Store Connect?', true)) {
    openUrl('https://appstoreconnect.apple.com/access/integrations/api');
  }
  state.apple.APP_STORE_CONNECT_KEY_ID = await ask('Key ID (10 chars)');
  state.apple.APP_STORE_CONNECT_ISSUER_ID = await ask('Issuer ID (UUID)');
  const p8Path = await ask('Path to the downloaded .p8 file', {
    default: join(
      process.env.HOME || '',
      'Downloads',
      `AuthKey_${state.apple.APP_STORE_CONNECT_KEY_ID}.p8`,
    ),
  });
  if (!existsSync(p8Path)) {
    fail(`File not found: ${p8Path}`);
    process.exit(1);
  }
  state.apple.APP_STORE_CONNECT_KEY = readFileSync(p8Path, 'utf8');
  writeState(state);
  ok('.p8 key loaded');
}

// ───────────────────────────────────────────────────────────────────
step(6, 'Mac code-signing certificate (.p12 export)');
info('This is the Mac DESKTOP signing identity (notarised DMG via build:desktop).');
info('iOS TestFlight signs via the App Store Connect API key above, not this cert.');
if (state.apple.MAC_CERTIFICATE && (await confirm('  Re-use stored Mac cert?', true))) {
  ok('using stored cert');
} else {
  info('Listing code-signing identities from your login keychain...');
  let identities = '';
  try {
    identities = capture('security', ['find-identity', '-v', '-p', 'codesigning']);
  } catch (e) {
    fail('security command failed — see error above');
    process.exit(1);
  }
  console.log(identities);
  const developerIdLines = identities
    .split('\n')
    .filter((l) => l.includes('Developer ID Application'));
  if (developerIdLines.length === 0) {
    fail('No "Developer ID Application" cert found in your keychain.');
    info('1. Go to https://developer.apple.com/account/resources/certificates/list');
    info('2. Create a new "Developer ID Application" cert');
    info('3. Download and double-click to install into Keychain Access');
    info('4. Re-run pnpm setup:secrets');
    process.exit(1);
  }
  const certName = developerIdLines[0].match(/"([^"]+)"/)?.[1];
  ok(`found cert: ${certName}`);

  const certP12 = '/tmp/heron-mac-cert.p12';
  const certPwd = await ask('Pick an export password for the .p12 (used by CI)', { hidden: true });
  if (!certPwd) {
    fail('Password required.');
    process.exit(1);
  }

  info(`Exporting "${certName}" to ${certP12}`);
  info('Keychain Access will prompt for your login password to authorize the export.');
  // security export-keychain doesn't accept output password via CLI easily on
  // recent macOS -- use Keychain Access's manual export workflow OR security
  // export with password file. mkdtempSync produces a unique random-suffix
  // directory (CodeQL `js/insecure-temporary-file`-clean -- /tmp/heron-pwd.txt
  // was guessable + globally writable).
  const tmpDir = mkdtempSync(joinPath(tmpdir(), 'heron-pwd-'));
  const tmpPwdFile = joinPath(tmpDir, 'pwd.txt');
  writeFileSync(tmpPwdFile, certPwd, { mode: 0o600 });
  try {
    execSync(
      `security export -k login.keychain-db -t identities -f pkcs12 -P "${certPwd}" -o "${certP12}"`,
      { stdio: 'inherit' },
    );
    ok(`.p12 exported`);
  } catch {
    fail('export failed — see error above');
    info(
      'Fall back: open Keychain Access → My Certificates → right-click the Developer ID Application cert → Export → save as .p12 with the same password.',
    );
    const manualP12 = await ask('Path to manually-exported .p12');
    if (!existsSync(manualP12)) {
      fail('not found');
      process.exit(1);
    }
    execSync(`cp "${manualP12}" "${certP12}"`);
  } finally {
    try {
      execSync(`rm -f "${tmpPwdFile}"`);
    } catch {}
  }

  state.apple.MAC_CERTIFICATE = capture('base64', ['-i', certP12]);
  state.apple.MAC_CERTIFICATE_PASSWORD = certPwd;
  writeState(state);
  ok('cert exported + stashed in state');
}

// ───────────────────────────────────────────────────────────────────
// ─── iOS code signing (Fastlane match) ──────────────────────────────
info('');
info('Fastlane match — iOS code signing:');
info('  match keeps the Apple Distribution cert + ALL provisioning profiles in');
info('  ONE encrypted private git repo, fetched read-only by CI (no raw .p12).');
info('  1. Create an empty PRIVATE repo (e.g. github.com/<you>/heron-certs).');
info('  2. Populate it ONCE locally (uses the ASC key collected above):');
info('     cd ui/ios/App && bundle exec fastlane match appstore');
if (state.apple.MATCH_GIT_URL && (await confirm('  Re-use stored match config?', true))) {
  ok('using stored match config');
} else {
  state.apple.MATCH_GIT_URL = await ask('  MATCH_GIT_URL (private certs repo URL)', {
    default: state.apple.MATCH_GIT_URL,
  });
  state.apple.MATCH_PASSWORD = await ask('  MATCH_PASSWORD (encryption passphrase you choose)', {
    hidden: true,
  });
  writeState(state);
}

// ───────────────────────────────────────────────────────────────────
step(7, 'Writing ~/.heron/native-env');
const envBody = [
  '# Heron native build secrets — auto-generated. Do NOT commit.',
  `export APPLE_ID="${state.apple.APPLE_ID}"`,
  `export APPLE_TEAM_ID="${state.apple.APPLE_TEAM_ID}"`,
  `export APPLE_APP_SPECIFIC_PASSWORD="${state.apple.APPLE_APP_SPECIFIC_PASSWORD}"`,
  `export APP_STORE_CONNECT_KEY_ID="${state.apple.APP_STORE_CONNECT_KEY_ID}"`,
  `export APP_STORE_CONNECT_ISSUER_ID="${state.apple.APP_STORE_CONNECT_ISSUER_ID}"`,
  `export APP_STORE_CONNECT_PRIVATE_KEY="${Buffer.from(state.apple.APP_STORE_CONNECT_KEY ?? '').toString('base64')}"`,
  `export MAC_CERTIFICATE="${state.apple.MAC_CERTIFICATE ?? ''}"`,
  `export MAC_CERTIFICATE_PASSWORD="${state.apple.MAC_CERTIFICATE_PASSWORD}"`,
  `export MATCH_GIT_URL="${state.apple.MATCH_GIT_URL ?? ''}"`,
  `export MATCH_PASSWORD="${state.apple.MATCH_PASSWORD ?? ''}"`,
  '',
].join('\n');
mkdirSync(NATIVE_STATE_DIR, { recursive: true });
writeFileSync(envFile, envBody);
chmodSync(envFile, 0o600);
ok(`wrote ${envFile} (mode 600)`);

// ───────────────────────────────────────────────────────────────────
step(8, 'Pushing secrets to GitHub Actions');
info('These are pushed to GitHub Secrets so CI can sign builds.');
const secrets = {
  APPLE_ID: state.apple.APPLE_ID,
  APPLE_TEAM_ID: state.apple.APPLE_TEAM_ID,
  APPLE_APP_SPECIFIC_PASSWORD: state.apple.APPLE_APP_SPECIFIC_PASSWORD,
  APP_STORE_CONNECT_KEY_ID: state.apple.APP_STORE_CONNECT_KEY_ID,
  APP_STORE_CONNECT_ISSUER_ID: state.apple.APP_STORE_CONNECT_ISSUER_ID,
  // native-release.yml + doctor:native consume APP_STORE_CONNECT_PRIVATE_KEY
  // as base64-encoded .p8 contents (the electron leg base64-decodes it; the
  // ios leg passes it to fastlane with is_key_content_base64). Match that.
  APP_STORE_CONNECT_PRIVATE_KEY: Buffer.from(state.apple.APP_STORE_CONNECT_KEY ?? '').toString(
    'base64',
  ),
  MAC_CERTIFICATE: state.apple.MAC_CERTIFICATE,
  MAC_CERTIFICATE_PASSWORD: state.apple.MAC_CERTIFICATE_PASSWORD,
  MATCH_GIT_URL: state.apple.MATCH_GIT_URL,
  MATCH_PASSWORD: state.apple.MATCH_PASSWORD,
};
for (const [name, value] of Object.entries(secrets)) {
  if (!value) {
    warn(`skipping ${name} — empty`);
    continue;
  }
  // `gh secret set NAME --body "value" --repo repo` -- pipe via stdin for newlines.
  const proc = execSync(`gh secret set ${name} --repo ${repo}`, {
    input: value,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  ok(`set ${name}`);
}

// ───────────────────────────────────────────────────────────────────
step(9, 'Repo settings (optional)');
info('For automated releases (Conventional Commits → Release Please) to work cleanly,');
info('GitHub should enforce squash-merge: every PR merge = one commit = one possible release.');
if (await confirm('  Enforce squash-merge-only on this repo? (recommended)', true)) {
  try {
    // Disable merge commits and rebase merges, enable squash only.
    capture('gh', [
      'api',
      '-X',
      'PATCH',
      `/repos/${repo}`,
      '-f',
      'allow_merge_commit=false',
      '-f',
      'allow_squash_merge=true',
      '-f',
      'allow_rebase_merge=false',
      '-f',
      'delete_branch_on_merge=true',
    ]);
    ok('squash-merge enforced + auto-delete branch on merge');
  } catch (e) {
    warn(`couldn't update repo settings: ${e.message}`);
    warn(
      `run manually: gh api -X PATCH /repos/${repo} -f allow_merge_commit=false -f allow_squash_merge=true -f allow_rebase_merge=false`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────
step(10, 'Adding iOS Xcode extension targets (Widget / LiveActivity / ShareExt)');
const xcodegenScript = join(ROOT, 'scripts', 'native', 'add-xcode-targets.rb');
if (existsSync(xcodegenScript)) {
  if (await confirm('  Add the 3 Xcode extension targets now?', true)) {
    // Need xcodeproj gem
    info('Ensuring xcodeproj gem is installed (user gems)...');
    run('gem', ['install', 'xcodeproj', '--user-install'], { allowFail: true });
    run('ruby', [xcodegenScript], { cwd: join(UI, 'ios', 'App') });
    ok('Xcode targets added');
  }
} else {
  warn(
    'xcodegen script not found — Widget/LiveActivity/ShareExt targets must be added manually in Xcode.',
  );
}

// ───────────────────────────────────────────────────────────────────
step(11, 'Google Play Store (optional)');
info('Skip if you have no plans to ship Android via Play Store.');
info('Required for the build-android job in native-release.yml.');
info('Portal prerequisites (Google gates these on a human session -- do them first):');
info('  - Play Console signup: play.google.com/console/signup ($25 one-time + ID verification)');
info('  - Create app: All apps -> Create app; name from brand.json displayName; Free; App');
info('  - Content rating: Policy -> App content -> Content rating (IARC questionnaire)');
info('  - Data safety: Policy -> App content -> Data safety (local-first: none collected/shared)');
info('  - Privacy policy URL: mandatory + must resolve (Play rejects dead URLs)');
info('  - Target audience: Policy -> App content -> Target audience and content');
info('  Run `pnpm doctor:native` anytime for the full checklist. Skip if already done.');
if (await confirm('  Set up Play Store credentials now?', false)) {
  info('Google Cloud Console → IAM & Admin → Service Accounts → Create.');
  info('  Role: Service Account User.');
  info('Play Console → Setup → API access → Link to your GCP project, then');
  info('  grant the service account "Release manager" role on this app.');
  info('Then in GCP, create a JSON key for that service account + download it.');
  await openUrl('https://console.cloud.google.com/iam-admin/serviceaccounts');
  const jsonKeyPath = await ask('  Path to the downloaded service-account JSON file:');
  if (jsonKeyPath && existsSync(jsonKeyPath)) {
    const jsonKeyB64 = Buffer.from(readFileSync(jsonKeyPath, 'utf8')).toString('base64');
    state.android = state.android || {};
    state.android.PLAY_STORE_JSON_KEY = jsonKeyB64;
    info('Now for the release keystore. In Android Studio:');
    info('  Build → Generate Signed Bundle/APK → choose "Android App Bundle" → next');
    info('  Click "Create new..." next to "Key store path".');
    info('  Save it as ui/android/heron-release.keystore. Pick a strong password.');
    info('  Alias: heron (or whatever you prefer).');
    const ksPath = await ask(
      '  Path to the .keystore file (default: ui/android/heron-release.keystore):',
      join(UI, 'android', 'heron-release.keystore'),
    );
    if (ksPath && existsSync(ksPath)) {
      const ksB64 = Buffer.from(readFileSync(ksPath)).toString('base64');
      state.android.ANDROID_KEYSTORE_BASE64 = ksB64;
      state.android.ANDROID_KEYSTORE_PASSWORD = await ask('  Keystore password:');
      state.android.ANDROID_KEY_ALIAS = await ask('  Key alias (default: heron):', 'heron');
      state.android.ANDROID_KEY_PASSWORD = await ask('  Key password (often same as keystore):');
      writeState(state);
      // build.gradle reads release signing from keystore.properties (gitignored);
      // write it so local `gradlew bundleRelease` signs, mirroring CI.
      const ksPropsPath = join(UI, 'android', 'keystore.properties');
      writeFileSync(
        ksPropsPath,
        `storeFile=${ksPath}\nstorePassword=${state.android.ANDROID_KEYSTORE_PASSWORD}\nkeyAlias=${state.android.ANDROID_KEY_ALIAS}\nkeyPassword=${state.android.ANDROID_KEY_PASSWORD}\n`,
      );
      ok(`wrote ${ksPropsPath}`);
      ok('Play Store + keystore credentials saved locally');
    } else {
      warn('Keystore not found at provided path — skipping. Re-run setup when ready.');
    }
  } else {
    warn('Service-account JSON not found — skipping Play Store setup. Re-run when ready.');
  }
} else {
  info('Skipped. Re-run `pnpm setup:native` when ready to wire Play Store.');
}

// ───────────────────────────────────────────────────────────────────
step(12, 'Microsoft Store / Partner Center (optional)');
info('Skip if you have no plans to ship the Windows .appx via the Microsoft Store.');
info('Direct .exe via GitHub Releases stays the supported Windows path either way.');
if (await confirm('  Set up Microsoft Partner Center credentials now?', false)) {
  info('Partner Center signup: free for individuals, $19 one-time for orgs.');
  info('  https://partner.microsoft.com/en-us/dashboard/registration');
  info('After signup:');
  info('  1. Reserve app name "Heron" in Partner Center → Apps & games → New product');
  info('  2. Note the 12-char Product ID under "App identity" (e.g. 9NBLGGH4NNS1)');
  info('Azure AD app registration:');
  info('  3. Azure portal → App registrations → New registration');
  info('  4. Add API permissions: Microsoft Store Publishing API → app permissions');
  info('  5. Create a client secret + record value (only shown once)');
  await openUrl('https://partner.microsoft.com/en-us/dashboard/');
  const tenantId = await ask('  Azure AD Tenant ID (GUID):');
  const clientId = await ask('  Azure AD App registration Client ID (GUID):');
  const clientSecret = await ask('  Azure AD App registration Client Secret:');
  const productId = await ask('  Partner Center Product ID (12-char):');
  if (tenantId && clientId && clientSecret && productId) {
    state.microsoft = state.microsoft || {};
    state.microsoft.MICROSOFT_STORE_TENANT_ID = tenantId;
    state.microsoft.MICROSOFT_STORE_CLIENT_ID = clientId;
    state.microsoft.MICROSOFT_STORE_CLIENT_SECRET = clientSecret;
    state.microsoft.MICROSOFT_STORE_PRODUCT_ID = productId;
    writeState(state);
    ok('Microsoft Store / Partner Center credentials saved locally');
  } else {
    warn('Missing one or more values — skipping. Re-run when complete.');
  }
} else {
  info('Skipped. Re-run when ready.');
}

// ───────────────────────────────────────────────────────────────────
step(13, 'EU Digital Services Act trader information (mandatory for EU stores)');
info('Required for App Store + Play Store + Microsoft Store EU submissions since 2024.');
info('The stores expose a "Trader Information" form for ALL apps available in the EU.');
info('You fill this once per store via their web UI; we collect the values here so you can');
info('paste them in cleanly.');
if (await confirm('  Collect trader info now?', false)) {
  state.eu = state.eu || {};
  state.eu.TRADER_NAME = await ask('  Trader name (full legal name):');
  state.eu.TRADER_ADDRESS = await ask('  Trader address (street, city, postal code, country):');
  state.eu.TRADER_PHONE = await ask('  Trader phone (E.164 format, e.g. +1-555-555-1234):');
  state.eu.TRADER_EMAIL = await ask('  Trader email (public contact):');
  state.eu.TRADER_REGISTRATION = await ask(
    '  Trader registration number (if you have one; press Enter to skip):',
    '',
  );
  writeState(state);
  ok('EU DSA trader info saved locally');
  info('When submitting, paste these into:');
  info('  - App Store Connect → App → App Information → Trader Information');
  info('  - Play Console → Setup → App content → Trader status');
  info('  - Partner Center → Properties → Trader Information (EU)');
} else {
  info('Skipped. Re-run when ready.');
}

// ───────────────────────────────────────────────────────────────────
step(14, 'Discord bot + release-pipeline webhooks (optional)');
info('Skip if you have no plans to wire Discord automation.');
info('Discord bot reconciles channels + roles + AutoMod + Onboarding from');
info('.github/discord/config.yml via .github/workflows/maintain-discord.yml.');
info('Webhooks let release.yml + native-release.yml + CodeQL post directly to channels.');
info('Full walkthrough: docs/DISCORD.md.');
if (await confirm('  Set up Discord bot + webhooks now?', false)) {
  info('Discord Developer Portal: https://discord.com/developers/applications');
  info('  1. New Application -> name "Heron Reconciler"');
  info('  2. Bot tab -> Reset Token (record the token; only shown once)');
  info('  3. Enable: Server Members Intent + Presence Intent (Privileged Gateway Intents)');
  info('  4. Install the bot with this invite (fill in your Application ID):');
  info(
    '     https://discord.com/oauth2/authorize?client_id=<APP_ID>&scope=bot%20applications.commands&permissions=1100316934320',
  );
  info('     (= Manage Server + Channels + Roles + Webhooks + Audit Log + Moderate Members)');
  info('  5. Server Settings -> Roles: drag the bot role to the TOP -- a bot');
  info('     can only manage roles below its own.');
  info('  6. Server Settings -> Enable Community (for onboarding / welcome / rules).');
  await openUrl('https://discord.com/developers/applications');
  const botToken = await ask('  DISCORD_BOT_TOKEN (the bot token from step 2):');
  if (botToken) {
    state.discord = state.discord || {};
    state.discord.DISCORD_BOT_TOKEN = botToken;
  }
  info('');
  info('Now the per-channel webhooks. In Discord:');
  info('  Server Settings -> Integrations -> Webhooks -> New Webhook for each:');
  info('    - #changelog        -> DISCORD_WEBHOOK_RELEASES');
  info('    - #ci-builds        -> DISCORD_WEBHOOK_BUILDS');
  info('    - #security         -> DISCORD_WEBHOOK_SECURITY');
  info('  Copy each webhook URL + paste below. Press Enter to skip any.');
  const webhookReleases = await ask('  DISCORD_WEBHOOK_RELEASES (full webhook URL):');
  if (webhookReleases) state.discord.DISCORD_WEBHOOK_RELEASES = webhookReleases;
  const webhookBuilds = await ask('  DISCORD_WEBHOOK_BUILDS:');
  if (webhookBuilds) state.discord.DISCORD_WEBHOOK_BUILDS = webhookBuilds;
  const webhookSecurity = await ask('  DISCORD_WEBHOOK_SECURITY:');
  if (webhookSecurity) state.discord.DISCORD_WEBHOOK_SECURITY = webhookSecurity;
  writeState(state);
  ok('Discord credentials saved locally');
  info('Set the DISCORD_GUILD_ID repo variable too (the 18-digit guild id):');
  info(`  gh variable set DISCORD_GUILD_ID --body '1507162919421612134' --repo ${repo}`);
  info('After this completes + secrets push (next step), kick off the first reconcile:');
  info(`  gh workflow run maintain-discord.yml --ref main -f mode=apply --repo ${repo}`);
} else {
  info('Skipped. Re-run when ready.');
}

// ───────────────────────────────────────────────────────────────────
step(15, 'Pushing Play Store / Microsoft Store / Discord secrets to GitHub Actions');
const extraSecrets = {
  ...(state.android || {}),
  ...(state.microsoft || {}),
  ...(state.discord || {}),
};
for (const [name, value] of Object.entries(extraSecrets)) {
  if (!value) continue;
  try {
    execSync(`gh secret set ${name} --repo ${repo}`, {
      input: value,
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    ok(`set ${name}`);
  } catch (e) {
    warn(`couldn't set ${name}: ${e.message}`);
  }
}
if (Object.keys(extraSecrets).length === 0) {
  info('No extra secrets to push (Play Store + Microsoft Store + Discord all skipped).');
}

// ───────────────────────────────────────────────────────────────────
step(16, 'Done');
console.log(c.green('\n✓ Setup complete.\n'));
console.log(c.bold('Try one of these:'));
console.log('  pnpm dev:desktop          — Electron with HMR');
console.log('  pnpm dev:ios              — iOS sim + dev server');
console.log('  pnpm build:desktop        — produce signed DMG locally');
console.log('  pnpm build:ios            — upload to TestFlight');
console.log('  pnpm release patch        — bump + tag + push (CI does everything)');
console.log('');
console.log(c.dim(`Secrets stored at: ${envFile}`));
console.log(c.dim(`GitHub Actions secrets: ${repo}/settings/secrets/actions`));
