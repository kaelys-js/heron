/**
 * Playwright globalTeardown -- counterpart to global-setup.ts. Removes
 * the tmpdir created at HERON_E2E_DATA_DIR.
 *
 * Reads the dataDir from the `.dataDir` sidecar file (written by
 * global-setup) so we can clean up even if env vars drifted between
 * setup + teardown.
 *
 * Skipped when HERON_E2E_PRESERVE=1 (debug helper for inspecting
 * the seeded state after a failed run).
 */
import fs from 'node:fs';
import path from 'node:path';

export default async function globalTeardown(): Promise<void> {
  if (process.env.HERON_E2E_PRESERVE === '1') {
    console.log('[e2e:global-teardown] HERON_E2E_PRESERVE=1 — skipping cleanup.');
    return;
  }

  const sidecar = path.join(__dirname, '.dataDir');
  if (!fs.existsSync(sidecar)) {
    return;
  }

  const dataDir = fs.readFileSync(sidecar, 'utf8').trim();
  if (dataDir && fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    console.log(`[e2e:global-teardown] Removed ${dataDir}`);
  }
  fs.unlinkSync(sidecar);
}
