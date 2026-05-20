/**
 * E2E test-user constants. The actual seeding happens ONCE per test
 * run via `playwright.config.ts -> globalSetup` (see global-setup.ts).
 *
 * Specs that need to assert against the seeded user import these
 * constants instead of re-seeding per-test. The Playwright webServer
 * is a single long-lived process; we couldn't reseed it between specs
 * even if we wanted to.
 *
 * If you need a SEPARATE user shape for a future test scenario
 * (multi-tenant, role-permission cases), add a second seed step in
 * global-setup.ts -- don't re-export per-spec seed helpers from here.
 */

export const TEST_USER_ID = 'u_e2e';
export const TEST_USER_EMAIL = 'e2e@heron.test';
export const TEST_USER_NAME = 'E2E Test User';
export const TEST_PROFILE_SLUG = 'default';

/**
 * Information about the seeded install. Same id/email every run for
 * deterministic asserts. dataDir is read at runtime from the sidecar
 * file global-setup wrote.
 */
export type SeededInstall = {
  /** Absolute tmpdir path passed to the preview server as HERON_DATA_DIR. */
  dataDir: string;
  /** Seeded owner user -- id/email/name match what globalSetup inserted. */
  user: { id: string; email: string; name: string };
  /** Profile slug used in the test layout. */
  profileSlug: string;
};

/** Read the seed metadata that globalSetup wrote. Specs call this in
 *  `beforeAll` when they need the dataDir path (most don't -- the
 *  webServer is already pointed at it via env). */
export async function getSeededInstall(): Promise<SeededInstall> {
  // ESM imports (ui/package.json is "type": "module"). __dirname needs
  // import.meta.url reconstruction.
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const sidecar = path.join(__dirname, '.dataDir');
  if (!fs.existsSync(sidecar)) {
    throw new Error(
      'getSeededInstall: .dataDir sidecar missing. Did Playwright globalSetup run? ' +
        'Check playwright.config.ts -> globalSetup is set to ' +
        '"./e2e/_helpers/global-setup.ts".',
    );
  }
  const dataDir = fs.readFileSync(sidecar, 'utf8').trim();
  return {
    dataDir,
    user: { id: TEST_USER_ID, email: TEST_USER_EMAIL, name: TEST_USER_NAME },
    profileSlug: TEST_PROFILE_SLUG,
  };
}
