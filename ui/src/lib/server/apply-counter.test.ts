/** Tests for apply-counter: implicit (ALS) + explicit `*ForUser`
 *  variants. Mocks ROOT to a tmpdir. Two groups: implicit SYSTEM_USER
 *  fallback (single-user legacy), and multi-user isolation -- user A's
 *  bumps must not leak into user B's counter (F17 regression guard). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

// Mock the ROOT export so all paths land in a tmpdir.
const TMP = path.join(tmpdir(), 'heron-apply-counter-' + Date.now());
vi.mock('./files', () => ({ ROOT: TMP }));

const {
  todayCount,
  bumpApplyCounter,
  applyCounterPath,
  todayCountForUser,
  bumpApplyCounterForUser,
  applyCounterPathForUser,
} = await import('./apply-counter');
const { runAsUser } = await import('./user-context');

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

describe('apply-counter — implicit (SYSTEM_USER fallback)', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  });

  afterEach(() => {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('todayCount returns 0 when file does not exist', () => {
    expect(todayCount()).toBe(0);
  });

  it('bumpApplyCounter returns 1 on first call', () => {
    expect(bumpApplyCounter()).toBe(1);
    expect(todayCount()).toBe(1);
  });

  it('bumpApplyCounter increments on subsequent calls', () => {
    bumpApplyCounter();
    bumpApplyCounter();
    expect(bumpApplyCounter()).toBe(3);
    expect(todayCount()).toBe(3);
  });

  it('persists today count to disk', () => {
    bumpApplyCounter();
    const raw = fs.readFileSync(applyCounterPath(), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed[todayKey()]).toBe(1);
  });

  it('preserves entries for other dates', () => {
    // Seed the file with a prior date
    fs.mkdirSync(path.dirname(applyCounterPath()), { recursive: true });
    const prior: Record<string, number> = {};
    prior['2023-01-01'] = 5;
    fs.writeFileSync(applyCounterPath(), JSON.stringify(prior));
    bumpApplyCounter();
    const after = JSON.parse(fs.readFileSync(applyCounterPath(), 'utf8'));
    expect(after['2023-01-01']).toBe(5);
    expect(after[todayKey()]).toBe(1);
  });

  it('handles corrupt JSON gracefully (returns 0, overwrites)', () => {
    fs.mkdirSync(path.dirname(applyCounterPath()), { recursive: true });
    fs.writeFileSync(applyCounterPath(), '{not valid json');
    expect(todayCount()).toBe(0);
    expect(bumpApplyCounter()).toBe(1);
  });

  it('handles array-shape JSON gracefully (treats as empty)', () => {
    fs.mkdirSync(path.dirname(applyCounterPath()), { recursive: true });
    fs.writeFileSync(applyCounterPath(), '[1, 2, 3]');
    expect(todayCount()).toBe(0);
  });

  it('applyCounterPath() resolves under the user-shared tree', () => {
    const p = applyCounterPath();
    expect(p).toContain('_shared');
    expect(p).toContain('apply-counter.json');
  });
});

describe('apply-counter — multi-user isolation (F17 regression guard)', () => {
  beforeEach(() => {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  });

  afterEach(() => {
    if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
  });

  it("user A's bumps don't appear in user B's count", async () => {
    await runAsUser('user_alice', async () => {
      bumpApplyCounter();
      bumpApplyCounter();
      bumpApplyCounter();
    });
    await runAsUser('user_bob', async () => {
      expect(todayCount()).toBe(0);
      bumpApplyCounter();
      expect(todayCount()).toBe(1);
    });
    // Alice's count is unchanged
    await runAsUser('user_alice', async () => {
      expect(todayCount()).toBe(3);
    });
  });

  it('counter paths are distinct between users', () => {
    const pA = applyCounterPathForUser('user_alice');
    const pB = applyCounterPathForUser('user_bob');
    expect(pA).not.toBe(pB);
    expect(pA).toContain('user_alice');
    expect(pB).toContain('user_bob');
    // Neither should overlap with SYSTEM_USER's path
    expect(pA).not.toContain('data/profiles/_shared');
    expect(pB).not.toContain('data/profiles/_shared');
  });

  it('explicit *ForUser variants ignore ALS context', async () => {
    // Inside Alice's context, bumping Bob explicitly writes to Bob's file
    await runAsUser('user_alice', async () => {
      bumpApplyCounterForUser('user_bob');
      bumpApplyCounterForUser('user_bob');
      // Alice's implicit count is untouched
      expect(todayCount()).toBe(0);
    });
    expect(todayCountForUser('user_bob')).toBe(2);
    expect(todayCountForUser('user_alice')).toBe(0);
  });

  it('SYSTEM_USER and a real userId map to different files', async () => {
    // No ALS context → SYSTEM_USER fallback
    bumpApplyCounter();
    expect(todayCount()).toBe(1);
    // Real user starts at 0
    await runAsUser('user_alice', async () => {
      expect(todayCount()).toBe(0);
    });
  });
});
