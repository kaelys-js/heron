/**
 * interview.ts — per-user story-bank + writing-samples reads.
 *
 * Pre-fix bug: interview.ts hardcoded
 *   - `<repo>/interview-prep/story-bank.md`
 *   - `<repo>/writing-samples/`
 * regardless of which user invoked `generateInterviewPrep`. Two users on
 * one machine had their interview briefs mixed: Alice's STAR stories
 * appeared in Bob's prep, and vice versa.
 *
 * The fix routes both reads through `userSharedPath('story-bank')` and
 * `profilePath(id, 'writing-samples-dir')` so the data is segregated by
 * user. These tests assert that segregation directly — call the helpers
 * for one user, write content, switch users, call again, and verify the
 * second user reads their own content (or empty if missing) rather than
 * the first user's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock ./files BEFORE importing interview — profile-paths.ts captures
// ROOT at module-load time, so an env-var override post-import is too
// late. Mocking the module gives us a per-test tmp root.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'career-ops-interview-test-'));
vi.mock('./files', async () => {
  const actual = await vi.importActual<typeof import('./files')>('./files');
  return {
    ...actual,
    ROOT: tmpRoot,
  };
});

const { runWithUser } = await import('./user-context');
const { loadStoryBank, loadWritingSamples } = await import('./interview');
const { ensureProfileDirsForUser, userSharedPathForUser, profilePathForUser } = await import(
  './profile-paths'
);

beforeEach(() => {
  // Each test gets a clean profiles tree under the same tmpRoot so the
  // module's frozen ROOT constant keeps working.
  for (const sub of ['users', 'profiles']) {
    try {
      fs.rmSync(path.join(tmpRoot, 'data', sub), { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

afterEach(() => {
  // Final cleanup happens via process exit + OS tmp reaper.
});

describe('loadStoryBank — per-user isolation', () => {
  it('reads from data/users/{uid}/profiles/_shared/story-bank.md', () => {
    const userId = 'user-alice';
    ensureProfileDirsForUser(userId, 'default');
    const aliceBank = userSharedPathForUser(userId, 'story-bank');
    fs.writeFileSync(aliceBank, 'ALICE_STORY_BANK_CONTENT');

    const got = runWithUser(userId, () => loadStoryBank('default'));
    expect(got).toBe('ALICE_STORY_BANK_CONTENT');
  });

  it("does NOT leak one user's story-bank into another user's reads", () => {
    ensureProfileDirsForUser('user-alice', 'default');
    ensureProfileDirsForUser('user-bob', 'default');
    fs.writeFileSync(userSharedPathForUser('user-alice', 'story-bank'), 'ALICE_ONLY');
    fs.writeFileSync(userSharedPathForUser('user-bob', 'story-bank'), 'BOB_ONLY');

    const aliceGot = runWithUser('user-alice', () => loadStoryBank('default'));
    const bobGot = runWithUser('user-bob', () => loadStoryBank('default'));

    expect(aliceGot).toBe('ALICE_ONLY');
    expect(bobGot).toBe('BOB_ONLY');
    expect(aliceGot).not.toContain('BOB');
    expect(bobGot).not.toContain('ALICE');
  });

  it('returns empty string when no story-bank exists for the user', () => {
    ensureProfileDirsForUser('user-empty', 'default');
    const got = runWithUser('user-empty', () => loadStoryBank('default'));
    expect(got).toBe('');
  });
});

describe('resetProfile — wipes the per-user story-bank, not the legacy repo-root path', () => {
  it('deletes data/users/{uid}/profiles/_shared/story-bank.md when scope=everything', async () => {
    const userId = 'user-reset-alice';
    ensureProfileDirsForUser(userId, 'default');
    const aliceBank = userSharedPathForUser(userId, 'story-bank');
    fs.writeFileSync(aliceBank, 'ALICE_BANK_BEFORE_RESET');
    // Seed profile.yml so resetProfile finds a real profile.
    fs.writeFileSync(
      profilePathForUser(userId, 'default', 'profile-yml'),
      'full_name: Alice\nemail: alice@example.com\n',
    );

    // Lazy-import the module under test post-vi.mock setup.
    const { resetProfile } = await import('./profile');
    runWithUser(userId, () => resetProfile('default', 'everything'));

    expect(fs.existsSync(aliceBank), 'alice story-bank should be wiped').toBe(false);
    expect(fs.existsSync(aliceBank + '.bak'), '.bak preserved for recovery').toBe(true);
  });

  it("does NOT touch another user's story-bank during reset", async () => {
    ensureProfileDirsForUser('user-alice2', 'default');
    ensureProfileDirsForUser('user-bob2', 'default');
    fs.writeFileSync(userSharedPathForUser('user-alice2', 'story-bank'), 'ALICE2');
    fs.writeFileSync(userSharedPathForUser('user-bob2', 'story-bank'), 'BOB2');
    fs.writeFileSync(
      profilePathForUser('user-alice2', 'default', 'profile-yml'),
      'full_name: Alice2\n',
    );

    const { resetProfile } = await import('./profile');
    runWithUser('user-alice2', () => resetProfile('default', 'everything'));

    // Alice's bank wiped, Bob's bank intact.
    expect(fs.existsSync(userSharedPathForUser('user-alice2', 'story-bank'))).toBe(false);
    expect(fs.readFileSync(userSharedPathForUser('user-bob2', 'story-bank'), 'utf8')).toBe('BOB2');
  });
});

describe('loadWritingSamples — per-profile per-user isolation', () => {
  it("reads from the user's profile writing-samples/ dir", () => {
    const userId = 'user-alice';
    ensureProfileDirsForUser(userId, 'default');
    const samplesDir = profilePathForUser(userId, 'default', 'writing-samples-dir');
    fs.writeFileSync(path.join(samplesDir, 'voice.md'), 'ALICE_VOICE');

    const got = runWithUser(userId, () => loadWritingSamples('default'));
    expect(got).toContain('ALICE_VOICE');
  });

  it("does NOT leak one user's writing samples into another user's reads", () => {
    ensureProfileDirsForUser('user-alice', 'default');
    ensureProfileDirsForUser('user-bob', 'default');
    fs.writeFileSync(
      path.join(profilePathForUser('user-alice', 'default', 'writing-samples-dir'), 'voice.md'),
      'ALICE_VOICE',
    );
    fs.writeFileSync(
      path.join(profilePathForUser('user-bob', 'default', 'writing-samples-dir'), 'voice.md'),
      'BOB_VOICE',
    );

    const aliceGot = runWithUser('user-alice', () => loadWritingSamples('default'));
    const bobGot = runWithUser('user-bob', () => loadWritingSamples('default'));

    expect(aliceGot).toContain('ALICE_VOICE');
    expect(aliceGot).not.toContain('BOB_VOICE');
    expect(bobGot).toContain('BOB_VOICE');
    expect(bobGot).not.toContain('ALICE_VOICE');
  });

  it('returns empty string when no writing-samples exist', () => {
    ensureProfileDirsForUser('user-empty', 'default');
    const got = runWithUser('user-empty', () => loadWritingSamples('default'));
    expect(got).toBe('');
  });

  it('caps total output at 3000 chars (regression guard)', () => {
    const userId = 'user-bulk';
    ensureProfileDirsForUser(userId, 'default');
    const samplesDir = profilePathForUser(userId, 'default', 'writing-samples-dir');
    fs.writeFileSync(path.join(samplesDir, 'a.md'), 'a'.repeat(2000));
    fs.writeFileSync(path.join(samplesDir, 'b.md'), 'b'.repeat(2000));
    fs.writeFileSync(path.join(samplesDir, 'c.md'), 'c'.repeat(2000));

    const got = runWithUser(userId, () => loadWritingSamples('default'));
    expect(got.length).toBeLessThanOrEqual(3000);
  });
});
