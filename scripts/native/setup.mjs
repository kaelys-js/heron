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
step('6b', 'Mac App Store signing (optional — electron-builder `mas` target)');
info('Only needed to ship the DESKTOP app via the Mac App Store.');
info('The notarised DMG (step 6) ships without this. Skip if unsure.');
if (
  state.apple.MAC_MAS_CERTIFICATE &&
  state.apple.MAC_PROVISIONING_PROFILE_BASE64 &&
  (await confirm('  Re-use stored Mac App Store signing config?', true))
) {
  ok('using stored Mac App Store config');
} else if (await confirm('  Set up Mac App Store signing now?', false)) {
  info("First create these in Apple's portal (no API auto-creates them):");
  info('  1. "Apple Distribution" cert         developer.apple.com → Certificates → +');
  info('  2. "Mac Installer Distribution" cert (same page)');
  info('  3. a "Mac App Store" provisioning profile for the brand.json bundle id');
  info('     developer.apple.com → Profiles → + → Mac App Store');
  info('Download all three; double-click the two .cer files to add them to Keychain Access.');
  if (await confirm('  Open the Apple certificates page now?', true)) {
    openUrl('https://developer.apple.com/account/resources/certificates/list');
  }

  // The installer cert is NOT a codesigning identity, so query the basic
  // policy (find-identity -v), not -p codesigning.
  const detectMas = () => {
    let out = '';
    try {
      out = capture('security', ['find-identity', '-v']);
    } catch {}
    return {
      app: /Apple Distribution|3rd Party Mac Developer Application/.test(out),
      installer: /Mac Installer Distribution|3rd Party Mac Developer Installer/.test(out),
    };
  };

  // Re-check the keychain AFTER you create the certs. (The old flow checked
  // once, BEFORE the certs existed, then asked for a .p12 that wasn't there.)
  let { app, installer } = detectMas();
  while (!(app && installer)) {
    const missing = [!app && '"Apple Distribution"', !installer && '"Mac Installer Distribution"']
      .filter(Boolean)
      .join(' + ');
    warn(`Not in your keychain yet: ${missing}`);
    info('Create + download each cert, then double-click the .cer to install it.');
    if (!(await confirm('  Re-check the keychain now? (No = skip MAS setup)', true))) break;
    ({ app, installer } = detectMas());
  }

  if (!(app && installer)) {
    info('Skipped Mac App Store signing. Re-run `pnpm setup:native` once the certs are installed.');
  } else {
    ok('found Apple Distribution + Mac Installer Distribution in the keychain');
    const profilePath = await ask('  Path to the downloaded "Mac App Store" .provisionprofile');
    if (!profilePath || !existsSync(profilePath)) {
      fail(`provisioning profile not found: ${profilePath}`);
      process.exit(1);
    }
    const masPwd = await ask('  Pick an export password for the MAS .p12 (used by CI)', {
      hidden: true,
    });
    if (!masPwd) {
      fail('Password required.');
      process.exit(1);
    }

    const masP12 = joinPath(tmpdir(), `heron-mas-${Date.now()}.p12`);
    let exported = false;
    info('Exporting the MAS signing identities to a .p12 …');
    info('macOS may prompt for your login password to authorize the export.');
    try {
      // `-t identities` exports cert+key pairs and silently SKIPS keys that are
      // marked non-exportable, so a stray duplicate cert can't block the export
      // the way selecting it in the Keychain Access GUI greys out ".p12".
      execSync(
        `security export -k login.keychain-db -t identities -f pkcs12 -P "${masPwd}" -o "${masP12}"`,
        { stdio: 'inherit' },
      );
      exported = existsSync(masP12);
    } catch {
      warn('automatic export failed.');
    }
    if (!exported) {
      info('Manual fallback — Keychain Access → My Certificates → select the "Apple Distribution"');
      info(
        '+ "Mac Installer Distribution" identities → right-click → Export → save a .p12 with the',
      );
      info('SAME password you just entered.');
      const manual = await ask('  Path to the exported .p12 (Enter to skip)', { default: '' });
      if (manual && existsSync(manual)) {
        execSync(`cp "${manual}" "${masP12}"`);
        exported = true;
      }
    }

    if (exported) {
      state.apple.MAC_MAS_CERTIFICATE = capture('base64', ['-i', masP12]);
      state.apple.MAC_MAS_CERTIFICATE_PASSWORD = masPwd;
      state.apple.MAC_PROVISIONING_PROFILE_BASE64 = capture('base64', ['-i', profilePath]);
      writeState(state);
      ok('Mac App Store cert + provisioning profile stashed (pushed to GitHub Secrets in step 8)');
    } else {
      warn('Skipped Mac App Store signing — no .p12 produced.');
    }
  }
} else {
  info('Skipped Mac App Store signing.');
}

// ───────────────────────────────────────────────────────────────────
// ─── iOS code signing (Fastlane match, auto-provisioned) ────────────
// match keeps the Apple Distribution cert + every provisioning profile in
// ONE encrypted PRIVATE git repo. We auto-create that repo + a repo-scoped
// SSH deploy key, so CI fetches certs with no broad PAT and you never make
// a repo or paste a URL by hand. CI signs read-only (Fastfile readonly:
// is_ci); the key's write access is used only for the one-time push below.
info('');
info('Fastlane match -- iOS code signing (auto-provisioned):');
const [certsOwner, heronRepoName] = repo.split('/');
const certsRepo = `${certsOwner}/${heronRepoName}-certs`;
const certsSshUrl = `git@github.com:${certsRepo}.git`;
const deployKeyPath = joinPath(NATIVE_STATE_DIR, 'match_deploy_key');

// Re-use only when a PRIOR run finished the bootstrap (certs repo populated).
// A stored MATCH_GIT_URL with no successful bootstrap (e.g. the first run hit
// a missing App ID) must fall through and retry, not be skipped as "done".
if (
  state.apple.MATCH_GIT_URL &&
  state.apple.MATCH_BOOTSTRAPPED &&
  (await confirm('  Re-use stored match config?', true))
) {
  ok('using stored match config');
} else {
  // 1. Encryption passphrase (you pick it; protects the repo contents).
  if (!state.apple.MATCH_PASSWORD) {
    state.apple.MATCH_PASSWORD = await ask('  MATCH_PASSWORD (encryption passphrase you choose)', {
      hidden: true,
    });
  }
  if (!state.apple.MATCH_PASSWORD) {
    fail('MATCH_PASSWORD required.');
    process.exit(1);
  }

  // 2. Create the private certs repo if it does not exist yet.
  let certsRepoExists = false;
  try {
    capture('gh', ['repo', 'view', certsRepo, '--json', 'name', '-q', '.name']);
    certsRepoExists = true;
  } catch {}
  if (certsRepoExists) {
    ok(`certs repo exists: ${certsRepo}`);
  } else {
    info(`Creating private certs repo ${certsRepo} ...`);
    run('gh', [
      'repo',
      'create',
      certsRepo,
      '--private',
      '--description',
      'Heron iOS signing certs + profiles (Fastlane match, encrypted). Keep private.',
    ]);
    ok(`created ${certsRepo} (private)`);
  }

  // 3. Repo-scoped deploy key. Write access lets the bootstrap below push;
  //    CI only ever reads (Fastfile readonly: is_ci).
  mkdirSync(NATIVE_STATE_DIR, { recursive: true });
  if (!existsSync(deployKeyPath)) {
    run('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'heron-match-ci', '-f', deployKeyPath]);
    info('Registering write deploy key on the certs repo ...');
    run(
      'gh',
      [
        'repo',
        'deploy-key',
        'add',
        `${deployKeyPath}.pub`,
        '-R',
        certsRepo,
        '--title',
        'heron-match-ci',
        '--allow-write',
      ],
      { allowFail: true },
    );
    ok('deploy key registered (repo-scoped)');
  } else {
    ok('deploy key already present locally');
  }

  state.apple.MATCH_GIT_URL = certsSshUrl;
  state.apple.MATCH_GIT_PRIVATE_KEY = readFileSync(deployKeyPath, 'utf8');
  writeState(state);

  // 4. Populate the repo ONCE: writes the dist cert + one profile per bundle
  //    id. The deploy key authorises the SSH push; the ASC key (step 5)
  //    authorises the Apple portal calls.
  info('Populating certs repo via Fastlane match (one-time bootstrap) ...');
  const sshCmd = `ssh -i ${deployKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;
  const iosAppDir = joinPath(ROOT, 'ui/ios/App');
  const bootstrapEnv = {
    GIT_SSH_COMMAND: sshCmd,
    MATCH_GIT_URL: certsSshUrl,
    MATCH_PASSWORD: state.apple.MATCH_PASSWORD,
    APP_STORE_CONNECT_API_KEY_ID: state.apple.APP_STORE_CONNECT_KEY_ID,
    APP_STORE_CONNECT_API_ISSUER_ID: state.apple.APP_STORE_CONNECT_ISSUER_ID,
    APP_STORE_CONNECT_API_KEY: Buffer.from(state.apple.APP_STORE_CONNECT_KEY ?? '').toString(
      'base64',
    ),
  };
  const bundleOk = run('bundle', ['install'], { cwd: iosAppDir, allowFail: true }).status === 0;
  const bootstrap = bundleOk
    ? run('bundle', ['exec', 'fastlane', 'ios', 'match_bootstrap'], {
        cwd: iosAppDir,
        env: bootstrapEnv,
        allowFail: true,
      })
    : { status: 1 };
  if (bundleOk && bootstrap.status === 0) {
    state.apple.MATCH_BOOTSTRAPPED = true;
    writeState(state);
    ok('certs repo populated (cert + profiles pushed)');
  } else {
    warn('match bootstrap did not finish -- see the error above.');
    info('App IDs + App Groups are auto-registered by the bootstrap. If it still');
    info('failed, the ASC API key likely lacks the "App Manager" role -- fix that');
    info('at appstoreconnect.apple.com, then re-run pnpm setup:native.');
  }
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
  `export MAC_MAS_CERTIFICATE="${state.apple.MAC_MAS_CERTIFICATE ?? ''}"`,
  `export MAC_MAS_CERTIFICATE_PASSWORD="${state.apple.MAC_MAS_CERTIFICATE_PASSWORD ?? ''}"`,
  `export MAC_PROVISIONING_PROFILE_BASE64="${state.apple.MAC_PROVISIONING_PROFILE_BASE64 ?? ''}"`,
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
  // Mac App Store (electron-builder `mas` target) -- only pushed when step 6b
  // provisioned them; the loop below skips empty values, so a DMG-only setup
  // leaves these unset and MAS signing cleanly skips in native-release.yml.
  MAC_MAS_CERTIFICATE: state.apple.MAC_MAS_CERTIFICATE,
  MAC_MAS_CERTIFICATE_PASSWORD: state.apple.MAC_MAS_CERTIFICATE_PASSWORD,
  MAC_PROVISIONING_PROFILE_BASE64: state.apple.MAC_PROVISIONING_PROFILE_BASE64,
  MATCH_GIT_URL: state.apple.MATCH_GIT_URL,
  MATCH_PASSWORD: state.apple.MATCH_PASSWORD,
  // Repo-scoped SSH deploy key (read-write) so CI can clone the private
  // certs repo. CI signs read-only; only the local bootstrap pushes.
  MATCH_GIT_PRIVATE_KEY: state.apple.MATCH_GIT_PRIVATE_KEY,
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
      chmodSync(ksPropsPath, 0o600); // contains signing passwords
      ok(`wrote ${ksPropsPath} (mode 600)`);
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
