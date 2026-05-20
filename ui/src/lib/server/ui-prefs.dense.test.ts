/**
 * ui-prefs.dense.test -- DEFAULT_PREFS + APPEARANCE_OPTIONS +
 * THEME_OPTIONS + readPrefs/writePrefs round-trip coverage.
 *
 * Complements the existing ui-prefs.test.ts which is more focused on
 * multi-user safety. This one drills the merge semantics + the
 * SYSTEM_USER_ID short-circuit branches.
 */
import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_OPTIONS,
  THEME_OPTIONS,
  DEFAULT_PREFS,
  readPrefs,
  writePrefs,
} from './ui-prefs';
import { runWithUser } from './user-context';

let __uidCounter = 0;
function freshUid(): string {
  __uidCounter++;
  return `prefs-dense-${process.pid}-${__uidCounter}-${Date.now().toString(36)}`;
}

describe('APPEARANCE_OPTIONS', () => {
  it('exports the canonical 3 options', () => {
    expect(APPEARANCE_OPTIONS).toEqual(['system', 'light', 'dark']);
  });
});

describe('THEME_OPTIONS', () => {
  it('exports the canonical 6 themes', () => {
    expect(THEME_OPTIONS).toEqual(['default', 'fuchsia', 'emerald', 'amber', 'blue', 'rose']);
  });
});

describe('DEFAULT_PREFS', () => {
  it('appearance defaults to system', () => {
    expect(DEFAULT_PREFS.appearance).toBe('system');
  });

  it('theme defaults to default', () => {
    expect(DEFAULT_PREFS.theme).toBe('default');
  });

  it('os notifications: error/warn/success ON; info OFF', () => {
    expect(DEFAULT_PREFS.notifications.os.error).toBe(true);
    expect(DEFAULT_PREFS.notifications.os.warn).toBe(true);
    expect(DEFAULT_PREFS.notifications.os.success).toBe(true);
    expect(DEFAULT_PREFS.notifications.os.info).toBe(false);
  });

  it('toast notifications: all ON', () => {
    expect(DEFAULT_PREFS.notifications.toast.error).toBe(true);
    expect(DEFAULT_PREFS.notifications.toast.warn).toBe(true);
    expect(DEFAULT_PREFS.notifications.toast.success).toBe(true);
    expect(DEFAULT_PREFS.notifications.toast.info).toBe(true);
  });

  it('mutedSources is an empty array', () => {
    expect(DEFAULT_PREFS.notifications.mutedSources).toEqual([]);
  });
});

describe('readPrefs / writePrefs (per-user via ALS)', () => {
  it('returns DEFAULT_PREFS for a brand-new user', () => {
    const uid = freshUid();
    runWithUser(uid, () => {
      const prefs = readPrefs();
      expect(prefs.appearance).toBe(DEFAULT_PREFS.appearance);
      expect(prefs.theme).toBe(DEFAULT_PREFS.theme);
    });
  });

  it('writePrefs persists + returns the merged shape', () => {
    const uid = freshUid();
    runWithUser(uid, () => {
      const next = writePrefs({ appearance: 'dark', theme: 'emerald' });
      expect(next.appearance).toBe('dark');
      expect(next.theme).toBe('emerald');
      expect(next.updatedAt).toBeGreaterThan(0);
    });
  });

  it('readPrefs reads back previously-written values', () => {
    const uid = freshUid();
    runWithUser(uid, () => {
      writePrefs({ appearance: 'light', theme: 'rose' });
    });
    runWithUser(uid, () => {
      const prefs = readPrefs();
      expect(prefs.appearance).toBe('light');
      expect(prefs.theme).toBe('rose');
    });
  });

  it('different users have isolated prefs', () => {
    const uidA = freshUid();
    const uidB = freshUid();
    runWithUser(uidA, () => writePrefs({ theme: 'amber' }));
    runWithUser(uidB, () => writePrefs({ theme: 'blue' }));
    runWithUser(uidA, () => {
      expect(readPrefs().theme).toBe('amber');
    });
    runWithUser(uidB, () => {
      expect(readPrefs().theme).toBe('blue');
    });
  });

  it('writing notifications merges deep (os + toast sub-objects)', () => {
    const uid = freshUid();
    runWithUser(uid, () => {
      writePrefs({
        notifications: {
          ...DEFAULT_PREFS.notifications,
          os: { ...DEFAULT_PREFS.notifications.os, error: false },
        },
      });
      const prefs = readPrefs();
      expect(prefs.notifications.os.error).toBe(false);
      expect(prefs.notifications.os.warn).toBe(true);
    });
  });

  it('writing mutedSources replaces the array', () => {
    const uid = freshUid();
    runWithUser(uid, () => {
      writePrefs({
        notifications: {
          ...DEFAULT_PREFS.notifications,
          mutedSources: ['settings.secrets', 'scan'],
        },
      });
      const prefs = readPrefs();
      expect(prefs.notifications.mutedSources).toEqual(['settings.secrets', 'scan']);
    });
  });

  it('writing displayName updates it', () => {
    const uid = freshUid();
    runWithUser(uid, () => {
      const out = writePrefs({ displayName: 'Alex Q.' });
      expect(out.displayName).toBe('Alex Q.');
    });
    runWithUser(uid, () => {
      expect(readPrefs().displayName).toBe('Alex Q.');
    });
  });

  it('second writePrefs UPDATES existing row (no duplicate)', () => {
    const uid = freshUid();
    runWithUser(uid, () => {
      writePrefs({ theme: 'amber' });
      writePrefs({ theme: 'rose' });
      expect(readPrefs().theme).toBe('rose');
    });
  });
});

describe('SYSTEM_USER_ID branches', () => {
  it('readPrefs returns DEFAULT_PREFS without touching the DB outside any ALS context', () => {
    const prefs = readPrefs();
    expect(prefs).toEqual({ ...DEFAULT_PREFS });
  });

  it('writePrefs for SYSTEM is a no-op (returns DEFAULT_PREFS, persists nothing)', () => {
    const result = writePrefs({ theme: 'rose' });
    expect(result.theme).toBe('default');
  });
});
