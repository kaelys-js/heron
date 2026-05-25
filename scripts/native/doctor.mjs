#!/usr/bin/env node
/**
 * doctor:native -- read-only check that the repo + GitHub repo are
 * release-ready.
 *
 * Three layers:
 *   1. LOCAL files exist (entitlements plist, Info.plist, Fastfile,
 *      Brand.swift, etc.) -- covered by the capacitor.integration test
 *      suite which we delegate to for completeness.
 *   2. LOCAL env file (~/.heron/native-env) populated by
 *      `pnpm setup:native`. Optional -- only needed if you want to
 *      run iOS / Mac builds from your laptop.
 *   3. GITHUB Secrets configured on the repo so CI can sign + upload.
 *      This is the gate that catches "I forgot to run setup:native"
 *      before you push a tag and burn 20 minutes of CI to learn the
 *      same thing.
 *
 * Exit codes:
 *   0  -- everything's wired
 *   1  -- missing secrets (release would fail)
 *   2  -- environment issue (gh not authed, etc.)
 *
 * Usage:
 *   pnpm doctor:native              # human-readable
 *   pnpm doctor:native --json       # machine-readable
 *   pnpm doctor:native --strict     # exit 1 on any warning too
 *   pnpm doctor:native --no-remote  # skip GitHub Secrets check (offline)
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { NATIVE_ENV_FILE } from './_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const flags = {
  json: process.argv.includes('--json'),
  strict: process.argv.includes('--strict'),
  noRemote: process.argv.includes('--no-remote'),
};

const G = '\x1b[32m',
  Y = '\x1b[33m',
  R = '\x1b[31m',
  B = '\x1b[1m',
  N = '\x1b[0m',
  DIM = '\x1b[2m';

const results = { ok: [], warn: [], fail: [] };
const log = {
  ok: (m) => {
    results.ok.push(m);
    if (!flags.json) console.log(`  ${G}✓${N} ${m}`);
  },
  warn: (m) => {
    results.warn.push(m);
    if (!flags.json) console.log(`  ${Y}⚠${N} ${m}`);
  },
  fail: (m) => {
    results.fail.push(m);
    if (!flags.json) console.log(`  ${R}✗${N} ${m}`);
  },
  step: (m) => {
    if (!flags.json) console.log(`\n${B}▸ ${m}${N}`);
  },
  info: (m) => {
    if (!flags.json) console.log(`  ${DIM}· ${m}${N}`);
  },
};

// ── 1. Local files (delegate to capacitor.integration test) ────────
log.step('Native readiness — local config');
{
  // Capacitor brand-consistency is asserted by
  // ui/src/lib/integration/capacitor.integration.test.ts.
  const r = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', '--', 'capacitor.integration', '--silent'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (r.status === 0) log.ok('capacitor.integration green — all branded files in place');
  else log.fail('capacitor.integration failed — run `pnpm test capacitor.integration` to see what');
}

// ── 2. Local credentials file ──────────────────────────────────────
log.step('Native readiness — local credentials (~/.heron/native-env)');
const envFile = NATIVE_ENV_FILE;
if (existsSync(envFile)) {
  log.ok(`local credentials file exists: ${envFile}`);
  const body = readFileSync(envFile, 'utf8');
  const wantedKeys = [
    'APPLE_ID',
    'APPLE_TEAM_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APP_STORE_CONNECT_KEY_ID',
    'APP_STORE_CONNECT_ISSUER_ID',
    'APP_STORE_CONNECT_PRIVATE_KEY',
  ];
  for (const k of wantedKeys) {
    if (new RegExp(`^${k}=`, 'm').test(body)) log.ok(`  ${k} set`);
    else log.warn(`  ${k} missing in ${envFile}`);
  }
} else {
  log.warn(`local credentials file missing: ${envFile}`);
  log.info(`run: pnpm setup:native    — interactive wizard fills this in`);
}

// ── 3. GitHub repo secrets (so CI can release) ─────────────────────
if (flags.noRemote) {
  log.info('skipping GitHub Secrets check (--no-remote)');
} else {
  log.step('Native readiness — GitHub repo secrets');
  let secrets = [];
  // Resolve target repo from the `origin` remote (not `upstream`).
  // Required when multiple remotes are configured.
  let targetRepo = '';
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    const m = url.match(/github\.com[:/]+([^/]+)\/([^/.]+)/);
    if (m) targetRepo = `${m[1]}/${m[2]}`;
  } catch {
    /* no origin */
  }
  if (!targetRepo) {
    log.fail('cannot resolve `origin` remote → no repo to check');
    if (!flags.json) console.log(`\n${R}🔴 doctor:native blocked${N}`);
    process.exit(2);
  }
  try {
    const r = execSync(`gh secret list --repo "${targetRepo}" --json name --jq ".[].name"`, {
      encoding: 'utf8',
    });
    secrets = r.split('\n').filter(Boolean);
    log.ok(`gh authed, ${secrets.length} secrets configured on ${targetRepo}`);
  } catch (e) {
    log.fail(`gh secret list failed for ${targetRepo} (not authed? wrong repo?)`);
    log.info('run: gh auth login');
    if (!flags.json) {
      console.log(`\n${R}🔴 doctor:native blocked: gh not authed${N}`);
    }
    process.exit(2);
  }

  const requiredSecrets = [
    'APPLE_TEAM_ID',
    'MAC_CERTIFICATE',
    'MAC_CERTIFICATE_PASSWORD',
    'MATCH_GIT_URL',
    'MATCH_PASSWORD',
    'APP_STORE_CONNECT_KEY_ID',
    'APP_STORE_CONNECT_ISSUER_ID',
    'APP_STORE_CONNECT_PRIVATE_KEY',
  ];
  for (const s of requiredSecrets) {
    if (secrets.includes(s)) log.ok(s);
    else log.fail(`${s} missing on the repo — release will fail`);
  }

  // Optional platform secrets -- WARN (never fail) when absent. Android is
  // gated by the PLAY_STORE_ENABLED repo var; Microsoft is its own opt-in.
  // A fork shipping iOS/macOS only stays green here.
  const optionalGroups = [
    [
      'Android / Play Store',
      [
        'PLAY_STORE_JSON_KEY',
        'ANDROID_KEYSTORE_BASE64',
        'ANDROID_KEYSTORE_PASSWORD',
        'ANDROID_KEY_ALIAS',
        'ANDROID_KEY_PASSWORD',
      ],
    ],
    [
      'Microsoft Store',
      [
        'MICROSOFT_STORE_TENANT_ID',
        'MICROSOFT_STORE_CLIENT_ID',
        'MICROSOFT_STORE_CLIENT_SECRET',
        'MICROSOFT_STORE_PRODUCT_ID',
      ],
    ],
  ];
  for (const [label, group] of optionalGroups) {
    const have = group.filter((s) => secrets.includes(s)).length;
    if (have === group.length) log.ok(`${label}: all ${group.length} secrets set`);
    else if (have === 0) log.info(`${label}: not configured (optional)`);
    else log.warn(`${label}: ${have}/${group.length} secrets set — incomplete`);
  }
}

// ── 4. Apple Dev portal manual steps (read-only checklist) ─────────
// Apple gates 3 setup actions behind their developer-portal UI:
// (a) App ID creation on developer.apple.com/account/resources/identifiers
// (b) App Store Connect app entry creation
// (c) App-specific password + ASC API key generation
//
// None of these are scriptable via public Apple APIs without a
// pre-existing API key (which itself requires (c) to obtain). The
// best we can do here is emit a checklist with direct URLs +
// surface the irreducible manual steps so the maintainer doesn't
// get caught at `pnpm build:ios` failing 5 layers in.
//
// Under --strict: emit as warnings (counts toward `results.warn`
// length, contributes to exit-1 under strict). In normal mode:
// info-only -- the actual build steps fail loudly if these are
// missing, so doctor:native stays exit-0 by default.
log.step('Native readiness -- Apple + Google + Microsoft portal + listing checklist');
{
  // Read brand.json once -- bundleId + name + displayName all come
  // from the SSOT. Hardcoding "heron" / "Heron" here would silently
  // drift on rebrand; pulling from brand.json keeps the checklist
  // consistent with whatever the maintainer set.
  const brand = (() => {
    try {
      return JSON.parse(readFileSync(join(ROOT, 'branding', 'brand.json'), 'utf8'));
    } catch {
      return {};
    }
  })();
  const bundleId = brand.identifiers?.bundleId || '<set in branding/brand.json>';
  const appName = brand.displayName || brand.name || '<displayName from brand.json>';
  const sku = brand.name || '<name from brand.json>';
  const fastlaneLabel = `${brand.name || 'app'} fastlane`;

  // The strict-mode hook: emit warnings (which the summary block
  // tallies) when --strict is set, info lines otherwise. Same content
  // either way; the difference is whether they count toward the
  // exit-1 threshold.
  const emit = flags.strict ? log.warn : log.info;

  emit('App ID creation -- developer.apple.com/account/resources/identifiers');
  emit(`  - Click + -> App IDs -> App; Explicit; paste bundle ID: ${bundleId}`);
  emit('  - Capabilities ON: Push Notifications, App Groups, Associated Domains');

  emit('App Store Connect entry -- appstoreconnect.apple.com');
  emit(`  - My Apps -> + -> New App; bundle ID = ${bundleId}; SKU = ${sku}; Name = ${appName}`);

  emit('App-specific password -- appleid.apple.com');
  emit(`  - Sign-In & Security -> App-Specific Passwords -> + -> label "${fastlaneLabel}"`);
  emit('  - Paste into pnpm setup:native when prompted');

  emit('ASC API key (.p8) -- appstoreconnect.apple.com/access/integrations/api');
  emit('  - + Create new key; Access = App Manager; download .p8 (one-time)');
  emit('  - Paste Key ID + Issuer ID + the .p8 file path into pnpm setup:native');

  emit('Google Play Console (Android) -- play.google.com/console');
  emit('  - Signup: play.google.com/console/signup ($25 one-time + ID verification)');
  emit(`  - Create app: All apps -> Create app; name = ${appName}; Free; App`);
  emit(
    `  - Service account: GCP IAM -> JSON key; Play Console -> API access -> Release manager on ${appName}`,
  );
  emit('  - Content rating (IARC) + Data safety (local-first: none collected/shared) +');
  emit('    Target audience: Policy -> App content');
  emit('  - Privacy policy URL: mandatory + must resolve (Play rejects dead URLs)');
  emit('  - Paste the service-account JSON path + 4 keystore values into pnpm setup:native');

  emit('Microsoft Store (optional) -- partner.microsoft.com/dashboard');
  emit('  - Signup (Individual free / Company $19); reserve app name -> 12-char Product ID');
  emit('  - Azure AD app registration -> client secret -> API permission Microsoft Store');
  emit('    Publishing API (Submissions.ReadWrite) -> grant admin consent -> link tenant');
  emit('  - Paste the 4 MICROSOFT_STORE_* values into pnpm setup:native (step 12)');
  emit('  - NB: the .appx is Store-signed on submission (no local appx cert needed)');

  emit('Store listing (all stores, before first submission):');
  emit('  - Content/age rating (IARC): no objectionable content, 18+ -> expect 4+/Everyone');
  emit('  - Data safety / privacy: local-first, none collected/shared; privacy URL must resolve');
  emit('  - EU trader info (App Store + Play + MS): collected via pnpm setup:native step 13');
  emit('  - Screenshots: iOS `bundle exec fastlane screenshots`; Android/MS captured per store');

  emit('Full walkthrough: TODO-INSTRUCTIONS.md (gitignored, repo root)');
}

// ── Summary ─────────────────────────────────────────────────────────
if (flags.json) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.fail.length > 0 ? 1 : 0);
}

console.log(
  `\n${B}Summary${N}  ${G}${results.ok.length}${N} ok · ${Y}${results.warn.length}${N} warn · ${R}${results.fail.length}${N} fail`,
);
if (results.fail.length > 0) {
  console.log(`\n${R}🔴 Native release would FAIL.${N} Fix:`);
  console.log(`   1. pnpm setup:native      (interactive wizard)`);
  console.log(`   2. pnpm doctor:native     (re-run this check)`);
  process.exit(1);
}
if (flags.strict && results.warn.length > 0) {
  console.log(`\n${Y}⚠  --strict mode: warnings count as failures.${N}`);
  process.exit(1);
}
console.log(`${G}🟢 Native release ready.${N}`);
