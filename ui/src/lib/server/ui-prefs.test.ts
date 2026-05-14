/**
 * lib/server/ui-prefs — per-user UI preferences in app.db.ui_prefs.
 *
 * Mocks the DB chain + filesystem so we can exercise the prefs
 * merge/migrate/avatar paths without touching real SQLite or disk.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbRows: Record<string, Record<string, unknown> | undefined> = {};
const inserts: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];

const appDbMock = {
  select: (_: unknown) => ({
    from: () => ({
      where: (cond: { value?: string }) => ({
        get: () => dbRows[cond.value ?? ''],
      }),
    }),
  }),
  insert: () => ({
    values: (v: Record<string, unknown>) => {
      inserts.push(v);
      dbRows[v.userId as string] = v;
      return {
        onConflictDoNothing: () => ({ run: () => undefined }),
        run: () => undefined,
      };
    },
  }),
  update: () => ({
    set: (v: Record<string, unknown>) => ({
      where: (cond: { value?: string }) => ({
        run: () => {
          updates.push(v);
          if (cond.value) {
            dbRows[cond.value] = { ...(dbRows[cond.value] ?? {}), ...v };
          }
        },
      }),
    }),
  }),
};

let currentUser = 'user-A';

vi.mock('./db', () => ({ appDb: appDbMock }));
vi.mock('./db/app-schema', () => ({
  uiPrefs: {
    userId: { name: 'userId', table: 'ui_prefs' },
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: (_col: unknown, val: string) => ({ value: val }),
}));
vi.mock('./files', () => ({ ROOT: '/tmp/career-ops-test-root' }));
vi.mock('./user-context', () => ({
  currentUserIdOrDefault: () => currentUser,
  SYSTEM_USER_ID: '__system__',
}));

const fsMock = {
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  realpathSync: vi.fn((p: string) => p),
};
vi.mock('node:fs', () => ({ default: fsMock, ...fsMock }));

const { readPrefs, writePrefs, DEFAULT_PREFS, APPEARANCE_OPTIONS, THEME_OPTIONS, saveAvatar } =
  await import('./ui-prefs');

beforeEach(() => {
  Object.keys(dbRows).forEach((k) => delete dbRows[k]);
  inserts.length = 0;
  updates.length = 0;
  fsMock.existsSync.mockReset().mockReturnValue(false);
  fsMock.readFileSync.mockReset().mockReturnValue('{}');
  fsMock.writeFileSync.mockReset();
  fsMock.mkdirSync.mockReset();
  fsMock.unlinkSync.mockReset();
  fsMock.realpathSync.mockReset().mockImplementation((p: string) => p);
  currentUser = 'user-A';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ui-prefs — constants', () => {
  it('exposes APPEARANCE_OPTIONS with system/light/dark', () => {
    expect(APPEARANCE_OPTIONS).toEqual(['system', 'light', 'dark']);
  });

  it('exposes 6 THEME_OPTIONS', () => {
    expect(THEME_OPTIONS).toHaveLength(6);
    expect(THEME_OPTIONS).toContain('default');
    expect(THEME_OPTIONS).toContain('fuchsia');
  });

  it('DEFAULT_PREFS is system / default / info-toast-on', () => {
    expect(DEFAULT_PREFS.appearance).toBe('system');
    expect(DEFAULT_PREFS.theme).toBe('default');
    expect(DEFAULT_PREFS.notifications.toast.info).toBe(true);
    // OS notifications for info are off by default (avoid noise)
    expect(DEFAULT_PREFS.notifications.os.info).toBe(false);
  });
});

describe('ui-prefs — readPrefs', () => {
  it('returns DEFAULT_PREFS when no DB row exists for the user', () => {
    const prefs = readPrefs();
    expect(prefs.appearance).toBe(DEFAULT_PREFS.appearance);
    expect(prefs.theme).toBe(DEFAULT_PREFS.theme);
  });

  it('returns DEFAULT_PREFS for the SYSTEM_USER_ID (no row written)', () => {
    currentUser = '__system__';
    const prefs = readPrefs();
    expect(prefs.appearance).toBe(DEFAULT_PREFS.appearance);
    expect(inserts.length).toBe(0);
  });

  it('reads stored displayName / avatarPath / appearance / theme from the row', () => {
    dbRows['user-A'] = {
      userId: 'user-A',
      displayName: 'Alice',
      avatarPath: 'avatars/user-A/avatar.png',
      appearance: 'dark',
      theme: 'emerald',
      notifications: JSON.stringify(DEFAULT_PREFS.notifications),
      updatedAt: 1234,
    };
    const prefs = readPrefs();
    expect(prefs.displayName).toBe('Alice');
    expect(prefs.avatarPath).toBe('avatars/user-A/avatar.png');
    expect(prefs.appearance).toBe('dark');
    expect(prefs.theme).toBe('emerald');
    expect(prefs.updatedAt).toBe(1234);
  });

  it('falls back to default notifications if stored JSON is malformed', () => {
    dbRows['user-A'] = {
      userId: 'user-A',
      appearance: 'light',
      theme: 'default',
      notifications: 'not-json',
      updatedAt: 0,
    };
    const prefs = readPrefs();
    expect(prefs.notifications.toast.error).toBe(true);
  });
});

describe('ui-prefs — writePrefs', () => {
  it('INSERTs when no row exists; the row reflects the patched fields', () => {
    writePrefs({ appearance: 'dark', theme: 'rose' });
    expect(inserts.length).toBe(1);
    expect(inserts[0].appearance).toBe('dark');
    expect(inserts[0].theme).toBe('rose');
  });

  it('UPDATEs when a row already exists', () => {
    dbRows['user-A'] = {
      userId: 'user-A',
      appearance: 'light',
      theme: 'default',
      notifications: JSON.stringify(DEFAULT_PREFS.notifications),
      updatedAt: 100,
    };
    writePrefs({ appearance: 'dark' });
    expect(updates.length).toBe(1);
    expect(updates[0].appearance).toBe('dark');
  });

  it('preserves unchanged fields during a partial write (merge semantics)', () => {
    dbRows['user-A'] = {
      userId: 'user-A',
      displayName: 'Alice',
      appearance: 'light',
      theme: 'default',
      notifications: JSON.stringify(DEFAULT_PREFS.notifications),
      updatedAt: 100,
    };
    writePrefs({ appearance: 'dark' });
    expect(updates[0].displayName).toBe('Alice'); // preserved
    expect(updates[0].appearance).toBe('dark'); // patched
  });

  it('returns DEFAULT_PREFS without writing for the SYSTEM_USER_ID', () => {
    currentUser = '__system__';
    writePrefs({ appearance: 'dark' });
    expect(inserts.length).toBe(0);
    expect(updates.length).toBe(0);
  });

  it('updates the updatedAt timestamp every write', () => {
    const before = Date.now();
    writePrefs({ theme: 'amber' });
    const written = inserts[0].updatedAt as number;
    expect(written).toBeGreaterThanOrEqual(before);
  });
});

describe('ui-prefs — notification merge', () => {
  it('deep-merges patched os notification flags with stored ones', () => {
    dbRows['user-A'] = {
      userId: 'user-A',
      appearance: 'light',
      theme: 'default',
      notifications: JSON.stringify({
        os: { error: true, warn: true, success: true, info: false },
        toast: { error: true, warn: true, success: true, info: true },
        mutedSources: ['scan'],
      }),
      updatedAt: 100,
    };
    writePrefs({
      notifications: {
        os: { ...DEFAULT_PREFS.notifications.os, info: true },
        toast: DEFAULT_PREFS.notifications.toast,
        mutedSources: [],
      },
    });
    const stored = JSON.parse(updates[0].notifications as string);
    expect(stored.os.info).toBe(true);
    expect(stored.os.error).toBe(true); // preserved
  });
});

describe('ui-prefs — saveAvatar', () => {
  it('rejects unsupported content types', () => {
    const r = saveAvatar(Buffer.from('x'), 'image/bmp');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Unsupported');
  });

  it('rejects buffers larger than 2MB', () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1);
    const r = saveAvatar(big, 'image/png');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('2MB');
  });

  it('rejects unauthenticated callers (SYSTEM_USER_ID)', () => {
    currentUser = '__system__';
    const r = saveAvatar(Buffer.from('x'), 'image/png');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('unauthenticated');
  });

  it('accepts a png + writes it under data/avatars/<userId>/', () => {
    const r = saveAvatar(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');
    expect(r.ok).toBe(true);
    expect(r.path).toBe('avatars/user-A/avatar.png');
    expect(fsMock.writeFileSync).toHaveBeenCalled();
  });

  it('accepts jpeg/gif/webp', () => {
    expect(saveAvatar(Buffer.from('x'), 'image/jpeg').ok).toBe(true);
    expect(saveAvatar(Buffer.from('x'), 'image/gif').ok).toBe(true);
    expect(saveAvatar(Buffer.from('x'), 'image/webp').ok).toBe(true);
  });
});
