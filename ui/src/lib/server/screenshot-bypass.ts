/** Double-gated auth bypass used ONLY by the screenshot capture pipeline
 *  (capture-screenshots.mjs + screenshots-refresh.yml). The bypass returns
 *  a synthetic demo user iff BOTH gates trip:
 *
 *    1. `process.env.HERON_SCREENSHOT_MODE === '1'` -- explicit opt-in
 *    2. `process.env.HERON_DATA_DIR` resolves under `os.tmpdir()` -- the
 *       data dir is a throwaway sandbox, not a real install
 *
 *  Either gate failing yields `null` so production paths never see a
 *  synthetic session. The bypass is consulted from hooks.server.ts AFTER
 *  Better Auth populates the real session -- a genuine cookie always wins. */
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sep } from 'node:path';

export type ScreenshotDemoUser = {
  id: 'demo-screenshots';
  email: string;
  name: string;
  role: 'owner';
  emailVerified: true;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const DEMO_USER_FROZEN_TS = new Date('2026-05-19T00:00:00.000Z');

function dataDirIsInsideTmpdir(dataDir: string): boolean {
  // Path-injection guard: bare strings like "tmp" must not pass.
  if (!dataDir || dataDir.length < 2) return false;
  try {
    const tmpReal = realpathSync(tmpdir());
    const dataReal = realpathSync(dataDir);
    return dataReal === tmpReal || dataReal.startsWith(tmpReal + sep);
  } catch {
    // realpath throws if the path doesn't exist -- treat as "not safe".
    return false;
  }
}

/** Returns the synthetic demo user when BOTH bypass gates pass, else
 *  `null`. Callers (hooks.server.ts populateAuth) MUST treat `null` as
 *  "no bypass active" and proceed with the normal auth flow. */
export function screenshotBypassUser(): ScreenshotDemoUser | null {
  if (process.env.HERON_SCREENSHOT_MODE !== '1') return null;
  const dataDir = process.env.HERON_DATA_DIR;
  if (!dataDir) return null;
  if (!dataDirIsInsideTmpdir(dataDir)) return null;
  return {
    id: 'demo-screenshots',
    email: 'alex@demo.example',
    name: 'Alex Demo',
    role: 'owner',
    emailVerified: true,
    image: null,
    createdAt: DEMO_USER_FROZEN_TS,
    updatedAt: DEMO_USER_FROZEN_TS,
  };
}
