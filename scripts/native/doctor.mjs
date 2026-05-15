#!/usr/bin/env node
/**
 * doctor:native — read-only check that the repo + GitHub repo are
 * release-ready.
 *
 * Three layers:
 *   1. LOCAL files exist (entitlements plist, Info.plist, Fastfile,
 *      Brand.swift, etc.) — covered by the capacitor.integration test
 *      suite which we delegate to for completeness.
 *   2. LOCAL env file (~/.heron/native-env) populated by
 *      `pnpm setup:native`. Optional — only needed if you want to
 *      run iOS / Mac builds from your laptop.
 *   3. GITHUB Secrets configured on the repo so CI can sign + upload.
 *      This is the gate that catches "I forgot to run setup:native"
 *      before you push a tag and burn 20 minutes of CI to learn the
 *      same thing.
 *
 * Exit codes:
 *   0  — everything's wired
 *   1  — missing secrets (release would fail)
 *   2  — environment issue (gh not authed, etc.)
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
    'IOS_CERTIFICATE',
    'IOS_CERTIFICATE_PASSWORD',
    'IOS_PROVISIONING_PROFILE',
    'APP_STORE_CONNECT_KEY_ID',
    'APP_STORE_CONNECT_ISSUER_ID',
    'APP_STORE_CONNECT_PRIVATE_KEY',
  ];
  for (const s of requiredSecrets) {
    if (secrets.includes(s)) log.ok(s);
    else log.fail(`${s} missing on the repo — release will fail`);
  }
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
