/**
 * Drift test -- gates the JS PREVIEW_PORT mirror against the canonical
 * TS source at ui/e2e/_helpers/preview-server.ts.
 *
 * Why parse the .ts file instead of importing it: this test runs in
 * node's native test runner under no transpiler. The simplest possible
 * gate is a single regex against the .ts text content.
 *
 * Run via `node --test scripts/system/preview-server-port.test.mjs`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREVIEW_HOST, PREVIEW_PORT, PREVIEW_BASE_URL } from './preview-server-port.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TS_PATH = resolve(__dirname, '..', '..', 'ui', 'e2e', '_helpers', 'preview-server.ts');

test('JS preview-server-port mirrors TS preview-server', () => {
  const ts = readFileSync(TS_PATH, 'utf8');
  const portMatch = ts.match(/PREVIEW_PORT\s*=\s*(\d+)/);
  assert.ok(portMatch, 'preview-server.ts must export `export const PREVIEW_PORT = <number>;`');
  const tsPort = Number(portMatch[1]);
  const hostMatch = ts.match(/PREVIEW_HOST\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(hostMatch, 'preview-server.ts must export `export const PREVIEW_HOST = "<host>";`');
  const tsHost = hostMatch[1];
  assert.equal(
    PREVIEW_PORT,
    tsPort,
    `JS PREVIEW_PORT (${PREVIEW_PORT}) must match TS (${tsPort}).`,
  );
  assert.equal(
    PREVIEW_HOST,
    tsHost,
    `JS PREVIEW_HOST (${PREVIEW_HOST}) must match TS (${tsHost}).`,
  );
  assert.equal(
    PREVIEW_BASE_URL,
    `http://${tsHost}:${tsPort}`,
    'JS PREVIEW_BASE_URL must derive from the same host + port literals as TS.',
  );
});
