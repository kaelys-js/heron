#!/usr/bin/env node
/**
 * setup — one-shot interactive wizard for native-app readiness.
 *
 * Walks you through ALL the one-time setup so you never have to read
 * docs/native.md. Run once; every future native command just works.
 *
 * What it does:
 *
 *   1. Check + install missing tooling (gh, cocoapods, bundler, fastlane).
 *   2. Detect your Apple Developer credentials:
 *      - APPLE_ID + APPLE_TEAM_ID (you paste)
 *      - APPLE_APP_SPECIFIC_PASSWORD (opens appleid.apple.com → you paste)
 *      - APP_STORE_CONNECT_KEY_ID + ISSUER_ID + .p8 contents
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
 * Safe to re-run — it skips steps that are already complete and only
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
import { existsSync, writeFileSync, chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  // recent macOS — use Keychain Access's manual export workflow OR security
  // export with password file.
  const tmpPwdFile = '/tmp/heron-pwd.txt';
  writeFileSync(tmpPwdFile, certPwd);
  chmodSync(tmpPwdFile, 0o600);
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
step(7, 'Writing ~/.heron/native-env');
const envBody = [
  '# Heron native build secrets — auto-generated. Do NOT commit.',
  `export APPLE_ID="${state.apple.APPLE_ID}"`,
  `export APPLE_TEAM_ID="${state.apple.APPLE_TEAM_ID}"`,
  `export APPLE_APP_SPECIFIC_PASSWORD="${state.apple.APPLE_APP_SPECIFIC_PASSWORD}"`,
  `export APP_STORE_CONNECT_KEY_ID="${state.apple.APP_STORE_CONNECT_KEY_ID}"`,
  `export APP_STORE_CONNECT_ISSUER_ID="${state.apple.APP_STORE_CONNECT_ISSUER_ID}"`,
  `export APP_STORE_CONNECT_KEY=${JSON.stringify(state.apple.APP_STORE_CONNECT_KEY)}`,
  `export MAC_CERTIFICATE_PASSWORD="${state.apple.MAC_CERTIFICATE_PASSWORD}"`,
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
  APP_STORE_CONNECT_KEY: state.apple.APP_STORE_CONNECT_KEY,
  MAC_CERTIFICATE: state.apple.MAC_CERTIFICATE,
  MAC_CERTIFICATE_PASSWORD: state.apple.MAC_CERTIFICATE_PASSWORD,
};
for (const [name, value] of Object.entries(secrets)) {
  if (!value) {
    warn(`skipping ${name} — empty`);
    continue;
  }
  // `gh secret set NAME --body "value" --repo repo` — pipe via stdin for newlines.
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
step(11, 'Done');
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
