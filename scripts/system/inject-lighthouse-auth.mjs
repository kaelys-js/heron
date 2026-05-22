#!/usr/bin/env node
/**
 * inject-lighthouse-auth.mjs -- emit lighthouserc.runtime.json with an
 * Authorization header so Lighthouse can audit auth-gated routes.
 *
 * Lighthouse CI passes `settings.extraHeaders` to its puppeteer-driven
 * Chromium, but the lighthouserc.json checked into git can't carry a
 * secret. This script boots the preview server (just long enough to
 * mint a bearer via /api/auth/e2e-login), takes the returned token,
 * and writes a runtime-only config that lighthouse-ci-action then
 * consumes via its `configPath` input.
 *
 * Requirements:
 *   - The preview server must be reachable at PORT (default 4173).
 *   - HERON_E2E_DATA_DIR must be set (the e2e-login endpoint 404s
 *     without it).
 *   - data/users/u_e2e/... must exist (run global-setup OR
 *     seed-lighthouse-user.mjs which writes the same user).
 *
 * Usage:
 *   node scripts/system/inject-lighthouse-auth.mjs
 *
 * Writes:
 *   lighthouserc.runtime.json
 *
 * The runtime file is GITIGNORED; check it into the workflow's
 * working dir only, never the repo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const PORT = process.env.LIGHTHOUSE_PORT ?? '4173';
const SRC_CONFIG = resolve(REPO_ROOT, 'lighthouserc.json');
const DST_CONFIG = resolve(REPO_ROOT, 'lighthouserc.runtime.json');

async function mintBearerToken() {
  const url = `http://localhost:${PORT}/api/auth/e2e-login`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'u_e2e' }),
  });
  if (!resp.ok) {
    throw new Error(
      `inject-lighthouse-auth: /api/auth/e2e-login returned ${resp.status}. ` +
        'Confirm HERON_E2E_DATA_DIR is set on the preview server.',
    );
  }
  const body = await resp.json();
  if (!body.token) throw new Error('inject-lighthouse-auth: e2e-login response missing `token`.');
  return body.token;
}

function injectExtraHeaders(config, token) {
  const cloned = JSON.parse(JSON.stringify(config));
  cloned.ci ??= {};
  cloned.ci.collect ??= {};
  cloned.ci.collect.settings ??= {};
  cloned.ci.collect.settings.extraHeaders = JSON.stringify({
    Authorization: `Bearer ${token}`,
  });
  return cloned;
}

async function main() {
  console.error('▸ inject-lighthouse-auth');
  const srcRaw = readFileSync(SRC_CONFIG, 'utf8');
  const src = JSON.parse(srcRaw);
  const token = await mintBearerToken();
  console.error(`  ✓ minted token (${token.slice(0, 8)}...)`);
  const runtime = injectExtraHeaders(src, token);
  writeFileSync(DST_CONFIG, JSON.stringify(runtime, null, 2));
  console.error(`  ✓ wrote ${DST_CONFIG.replace(REPO_ROOT + '/', '')}`);
}

main().catch((err) => {
  console.error('::error::inject-lighthouse-auth failed:', err.message);
  process.exit(1);
});
