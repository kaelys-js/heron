/**
 * verify-pipeline.job — loadActiveProfileTracker must route through
 * activePath('applications') so multi-user installs verify the right
 * user's tracker.
 *
 * Pre-fix bug: `loadActiveProfileTracker` read data/profiles.json
 * directly, then fell back to data/applications.md at the repo root.
 * Under multi-user neither path matched the active user's tracker
 * (which lives at data/users/{uid}/profiles/{slug}/applications.md).
 * Result: the nightly integrity check ran against an empty/legacy file
 * and never raised real issues.
 *
 * Fix routes through activePath('applications') which respects both
 * the active user (via AsyncLocalStorage) and the active profile.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heron-verify-pipeline-test-'));
vi.mock('../files', async () => {
  const actual = await vi.importActual<typeof import('../files')>('../files');
  return { ...actual, ROOT: tmpRoot };
});

// Stub the report-issue + log-event side effects so failures don't pollute
// the test fixtures.
vi.mock('../events', () => ({ logEvent: vi.fn() }));
vi.mock('../issues', () => ({ reportIssue: vi.fn() }));
vi.mock('./registry', () => ({ register: vi.fn() }));

const { runWithUser } = await import('../user-context');
const { ensureProfileDirsForUser, profilePathForUser } = await import('../profile-paths');
// Import via dynamic-import so the module sees the mocked ./files.
const verifyMod = await import('./verify-pipeline.job');
// `loadActiveProfileTracker` is internal — exercise the public job
// instead by invoking the registered run() function, OR call its
// internal helper via runVerifyPipeline. We exercise via the exported
// run() result.

// applications.md column order per AGENTS.md: # | Date | Company | Role | Score | Status | PDF | Report | Notes
const APPS_BODY_GOOD = `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-05-01 | Acme | Engineer | 4.2/5 | Applied | ✅ | [001](reports/001-acme-2026-05-01.md) | clean |
`;

const APPS_BODY_BAD_STATUS = `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 1 | 2026-05-01 | Acme | Engineer | 4.2/5 | BogusStatusValue | ✅ | [001](reports/001-acme-2026-05-01.md) | bad |
`;

beforeEach(() => {
  // Clear the in-memory issue store between tests.
  for (const sub of ['users', 'profiles']) {
    try {
      fs.rmSync(path.join(tmpRoot, 'data', sub), { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('verify-pipeline.job — routes through activePath() for multi-user', () => {
  it("reads from the active user's applications.md, not the legacy path", async () => {
    const userId = 'verify-alice';
    ensureProfileDirsForUser(userId, 'default');
    const apps = profilePathForUser(userId, 'default', 'applications');
    fs.writeFileSync(apps, APPS_BODY_BAD_STATUS);

    // Put a CLEAN tracker at the legacy single-user path. Pre-fix this
    // would be what loadActiveProfileTracker reads; post-fix the
    // resolver routes through activePath() for this user.
    const legacyPath = path.join(tmpRoot, 'data', 'applications.md');
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, APPS_BODY_GOOD);

    const result = await runWithUser(userId, () => verifyMod.runVerifyPipeline());
    // If we'd read the LEGACY file, the result would show 0 warnings.
    // Post-fix we read alice's actual tracker, which contains the bogus
    // status — non-canonical-status warning.
    expect(result.meta?.warnings).toBeGreaterThan(0);
    expect(result.meta?.trackerPath).toBe(apps);
  });

  it('returns "no tracker yet" when no applications.md exists at the active path', async () => {
    const userId = 'verify-empty';
    ensureProfileDirsForUser(userId, 'default');
    // Don't write applications.md → activePath() resolves but file doesn't exist.
    const result = await runWithUser(userId, () => verifyMod.runVerifyPipeline());
    expect(result).toMatchObject({ ok: true, message: 'No tracker yet' });
  });

  it("does NOT verify another user's tracker", async () => {
    ensureProfileDirsForUser('verify-bob', 'default');
    ensureProfileDirsForUser('verify-clean', 'default');
    fs.writeFileSync(
      profilePathForUser('verify-bob', 'default', 'applications'),
      APPS_BODY_BAD_STATUS,
    );
    fs.writeFileSync(profilePathForUser('verify-clean', 'default', 'applications'), APPS_BODY_GOOD);

    // Running as 'verify-clean' MUST NOT find Bob's bad-status issue —
    // 0 warnings + trackerPath belongs to verify-clean.
    const result = await runWithUser('verify-clean', () => verifyMod.runVerifyPipeline());
    expect(result.meta?.warnings).toBe(0);
    expect(result.meta?.trackerPath).toContain('verify-clean');
  });
});
