/**
 * lib/server/profiles — legacy facade over profiles-db.
 *
 * This file exposes the legacy single-user API (readProfiles,
 * getActiveProfileId, createProfile, etc.) but routes every call
 * through profiles-db.ts scoped to the current user (via the
 * user-context AsyncLocalStorage). Tests mock both dependencies so
 * we can exercise the facade in isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DbProfile = {
  slug: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
};

const dbCalls: { fn: string; args: unknown[] }[] = [];
const profilesByUser: Record<string, DbProfile[]> = {};
const activeByUser: Record<string, string | undefined> = {};

let currentUser = 'user-1';

vi.mock('./user-context', () => ({
  currentUserIdOrDefault: () => currentUser,
}));

vi.mock('./profiles-db', () => ({
  listProfilesForUser: (uid: string) => {
    dbCalls.push({ fn: 'list', args: [uid] });
    return profilesByUser[uid] ?? [];
  },
  getActiveProfile: (uid: string) => {
    dbCalls.push({ fn: 'getActive', args: [uid] });
    const slug = activeByUser[uid];
    return (profilesByUser[uid] ?? []).find((p) => p.slug === slug);
  },
  getProfileBySlug: (uid: string, slug: string) => {
    dbCalls.push({ fn: 'getBySlug', args: [uid, slug] });
    return (profilesByUser[uid] ?? []).find((p) => p.slug === slug);
  },
  setActiveProfile: (uid: string, slug: string) => {
    dbCalls.push({ fn: 'setActive', args: [uid, slug] });
    activeByUser[uid] = slug;
  },
  createProfileFor: (uid: string, name: string, color: string) => {
    dbCalls.push({ fn: 'create', args: [uid, name, color] });
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const now = Date.now();
    const p: DbProfile = { slug, name, color, createdAt: now, updatedAt: now };
    profilesByUser[uid] = [...(profilesByUser[uid] ?? []), p];
    return p;
  },
  renameProfileFor: (uid: string, slug: string, name: string) => {
    dbCalls.push({ fn: 'rename', args: [uid, slug, name] });
    const list = profilesByUser[uid] ?? [];
    const p = list.find((x) => x.slug === slug);
    if (!p) throw new Error('not found');
    p.name = name;
    p.updatedAt = Date.now();
    return p;
  },
  recolorProfileFor: (uid: string, slug: string, color: string) => {
    dbCalls.push({ fn: 'recolor', args: [uid, slug, color] });
    const list = profilesByUser[uid] ?? [];
    const p = list.find((x) => x.slug === slug);
    if (!p) throw new Error('not found');
    p.color = color;
    p.updatedAt = Date.now();
    return p;
  },
  deleteProfileFor: (uid: string, slug: string) => {
    dbCalls.push({ fn: 'delete', args: [uid, slug] });
    profilesByUser[uid] = (profilesByUser[uid] ?? []).filter((p) => p.slug !== slug);
  },
  slugFromName: (name: string) => name.toLowerCase().replace(/\s+/g, '-'),
  PROFILE_COLORS: ['blue', 'emerald', 'rose', 'amber'] as const,
}));

const {
  readProfiles,
  writeProfiles,
  getActiveProfileId,
  setActiveProfileId,
  getProfile,
  listProfiles,
  createProfile,
  renameProfile,
  recolorProfile,
  deleteProfile,
  PROFILE_COLORS,
  slugFromName,
} = await import('./profiles');

beforeEach(() => {
  Object.keys(profilesByUser).forEach((k) => delete profilesByUser[k]);
  Object.keys(activeByUser).forEach((k) => delete activeByUser[k]);
  dbCalls.length = 0;
  currentUser = 'user-1';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('profiles — readProfiles', () => {
  it('returns activeId="default" and empty list when DB has nothing', () => {
    const s = readProfiles();
    expect(s.activeId).toBe('default');
    expect(s.profiles).toEqual([]);
  });

  it('maps DbProfile.slug → Profile.id', () => {
    profilesByUser['user-1'] = [
      { slug: 'work', name: 'Work', color: 'blue', createdAt: 1, updatedAt: 2 },
    ];
    activeByUser['user-1'] = 'work';
    const s = readProfiles();
    expect(s.profiles[0].id).toBe('work');
    expect(s.profiles[0].name).toBe('Work');
  });

  it('maps DbProfile.updatedAt → Profile.lastActiveAt', () => {
    profilesByUser['user-1'] = [
      { slug: 'work', name: 'Work', color: 'blue', createdAt: 1, updatedAt: 999 },
    ];
    expect(readProfiles().profiles[0].lastActiveAt).toBe(999);
  });

  it('returns first profile id when no active set + at least one profile exists', () => {
    profilesByUser['user-1'] = [
      { slug: 'one', name: 'One', color: 'blue', createdAt: 1, updatedAt: 1 },
      { slug: 'two', name: 'Two', color: 'rose', createdAt: 2, updatedAt: 2 },
    ];
    expect(readProfiles().activeId).toBe('one');
  });

  it('scopes reads to the current user (asyncLocalStorage)', () => {
    currentUser = 'user-2';
    profilesByUser['user-2'] = [
      { slug: 'p1', name: 'P1', color: 'blue', createdAt: 1, updatedAt: 1 },
    ];
    profilesByUser['user-1'] = [
      { slug: 'p9', name: 'P9', color: 'blue', createdAt: 1, updatedAt: 1 },
    ];
    expect(readProfiles().profiles.map((p) => p.id)).toEqual(['p1']);
  });
});

describe('profiles — writeProfiles', () => {
  it('is a no-op (legacy facade — actual writes go through targeted helpers)', () => {
    expect(() => writeProfiles({ activeId: 'x', profiles: [] })).not.toThrow();
    expect(dbCalls.length).toBe(0);
  });
});

describe('profiles — setActiveProfileId', () => {
  it('routes through setActiveProfile in profiles-db', () => {
    setActiveProfileId('work');
    expect(dbCalls.some((c) => c.fn === 'setActive' && c.args[1] === 'work')).toBe(true);
  });

  it('returns the refreshed ProfilesState after switching', () => {
    profilesByUser['user-1'] = [
      { slug: 'work', name: 'W', color: 'blue', createdAt: 1, updatedAt: 1 },
    ];
    const s = setActiveProfileId('work');
    expect(s.activeId).toBe('work');
  });
});

describe('profiles — getProfile', () => {
  it('returns undefined when no match', () => {
    expect(getProfile('missing')).toBeUndefined();
  });

  it('maps DbProfile fields when match found', () => {
    profilesByUser['user-1'] = [
      { slug: 'work', name: 'Work', color: 'blue', createdAt: 1, updatedAt: 1 },
    ];
    const p = getProfile('work');
    expect(p?.name).toBe('Work');
    expect(p?.color).toBe('blue');
  });
});

describe('profiles — createProfile / renameProfile / recolorProfile / deleteProfile', () => {
  it('createProfile defaults color to blue', () => {
    const p = createProfile('My Track');
    expect(p.color).toBe('blue');
    expect(dbCalls.find((c) => c.fn === 'create')?.args[2]).toBe('blue');
  });

  it('createProfile honours explicit color', () => {
    const p = createProfile('My Track', 'emerald');
    expect(p.color).toBe('emerald');
  });

  it('renameProfile updates the DB row name', () => {
    profilesByUser['user-1'] = [
      { slug: 'work', name: 'Old', color: 'blue', createdAt: 1, updatedAt: 1 },
    ];
    renameProfile('work', 'New');
    expect(profilesByUser['user-1'][0].name).toBe('New');
  });

  it('recolorProfile updates the DB row color', () => {
    profilesByUser['user-1'] = [
      { slug: 'work', name: 'W', color: 'blue', createdAt: 1, updatedAt: 1 },
    ];
    recolorProfile('work', 'rose');
    expect(profilesByUser['user-1'][0].color).toBe('rose');
  });

  it('deleteProfile removes the DB row + returns refreshed state', () => {
    profilesByUser['user-1'] = [
      { slug: 'a', name: 'A', color: 'blue', createdAt: 1, updatedAt: 1 },
      { slug: 'b', name: 'B', color: 'rose', createdAt: 1, updatedAt: 1 },
    ];
    const s = deleteProfile('a');
    expect(s.profiles.length).toBe(1);
    expect(s.profiles[0].id).toBe('b');
  });
});

describe('profiles — module-level constants', () => {
  it('re-exports PROFILE_COLORS from profiles-db', () => {
    expect(PROFILE_COLORS).toContain('blue');
    expect(PROFILE_COLORS).toContain('rose');
  });

  it('re-exports slugFromName', () => {
    expect(slugFromName('Hello World')).toBe('hello-world');
  });
});

describe('profiles — listProfiles + getActiveProfileId', () => {
  it('listProfiles is readProfiles().profiles', () => {
    profilesByUser['user-1'] = [
      { slug: 'a', name: 'A', color: 'blue', createdAt: 1, updatedAt: 1 },
    ];
    expect(listProfiles().map((p) => p.id)).toEqual(['a']);
  });

  it('getActiveProfileId is readProfiles().activeId', () => {
    profilesByUser['user-1'] = [
      { slug: 'a', name: 'A', color: 'blue', createdAt: 1, updatedAt: 1 },
    ];
    activeByUser['user-1'] = 'a';
    expect(getActiveProfileId()).toBe('a');
  });
});
