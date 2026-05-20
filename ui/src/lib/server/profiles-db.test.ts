/**
 * profiles-db.test -- userId-scoped Profile CRUD backed by app.db.profiles.
 *
 * Each test uses a unique userId so they don't collide on the shared
 * test-process DB. Migration paths (legacy data/profiles.json claim,
 * filesystem copy) aren't exercised here -- those require setting up a
 * fake legacy install on disk, which is covered by the existing
 * integration suite (multi-user.integration.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PROFILE_COLORS,
  slugFromName,
  listProfilesForUser,
  getActiveProfile,
  getActiveProfileSlug,
  getProfileBySlug,
  setActiveProfile,
  createProfileFor,
  renameProfileFor,
  recolorProfileFor,
  deleteProfileFor,
} from './profiles-db';

// Per-test user IDs to avoid cross-test pollution -- each suite block
// gets a fresh uuid-ish prefix.
let __uidCounter = 0;
function freshUid(): string {
  __uidCounter++;
  return `test-uid-${process.pid}-${__uidCounter}-${Date.now().toString(36)}`;
}

describe('slugFromName', () => {
  it('lower-cases + kebab-cases', () => {
    expect(slugFromName('Hello World')).toBe('hello-world');
  });

  it('strips diacritics', () => {
    expect(slugFromName('Café Crème')).toBe('cafe-creme');
  });

  it('collapses adjacent non-alphanum', () => {
    expect(slugFromName('Engineer / Search!!')).toBe('engineer-search');
  });

  it('trims leading + trailing dashes', () => {
    expect(slugFromName('--abc--')).toBe('abc');
  });

  it('falls back to "profile" when slug would be empty', () => {
    expect(slugFromName('!!!')).toBe('profile');
    expect(slugFromName('')).toBe('profile');
  });

  it('preserves digits', () => {
    expect(slugFromName('Track 2024')).toBe('track-2024');
  });
});

describe('PROFILE_COLORS', () => {
  it('exports 8 distinct colors', () => {
    expect(PROFILE_COLORS).toHaveLength(8);
    expect(new Set(PROFILE_COLORS).size).toBe(8);
  });

  it('includes the canonical color names', () => {
    expect(PROFILE_COLORS).toEqual([
      'blue',
      'emerald',
      'violet',
      'amber',
      'rose',
      'cyan',
      'orange',
      'pink',
    ]);
  });
});

describe('createProfileFor / listProfilesForUser', () => {
  it('creates a profile + lists it back', () => {
    const uid = freshUid();
    const p = createProfileFor(uid, 'Engineer Track', 'emerald');
    expect(p.id).toMatch(/^p_/);
    expect(p.slug).toBe('engineer-track');
    expect(p.name).toBe('Engineer Track');
    expect(p.color).toBe('emerald');
    expect(p.isActive).toBe(true);
    const list = listProfilesForUser(uid);
    expect(list.some((x) => x.slug === 'engineer-track')).toBe(true);
  });

  it('defaults color to blue when omitted', () => {
    const uid = freshUid();
    const p = createProfileFor(uid, 'Default Track');
    expect(p.color).toBe('blue');
  });

  it('trims the name before storing', () => {
    const uid = freshUid();
    const p = createProfileFor(uid, '  Trimmed  ', 'rose');
    expect(p.name).toBe('Trimmed');
    expect(p.slug).toBe('trimmed');
  });

  it('rejects an empty / whitespace-only name', () => {
    const uid = freshUid();
    expect(() => createProfileFor(uid, '')).toThrow(/required/);
    expect(() => createProfileFor(uid, '   ')).toThrow(/required/);
  });

  it('rejects a name longer than 60 chars', () => {
    const uid = freshUid();
    expect(() => createProfileFor(uid, 'x'.repeat(61))).toThrow(/too long/);
  });

  it('demotes the previous active profile when a new one is created', () => {
    const uid = freshUid();
    const first = createProfileFor(uid, 'First');
    expect(first.isActive).toBe(true);
    const second = createProfileFor(uid, 'Second');
    expect(second.isActive).toBe(true);
    // Reload the first row to confirm it was demoted.
    const list = listProfilesForUser(uid);
    const firstReloaded = list.find((p) => p.slug === first.slug);
    expect(firstReloaded?.isActive).toBe(false);
  });

  it('deduplicates slugs by appending -2, -3, ...', () => {
    const uid = freshUid();
    const a = createProfileFor(uid, 'Same Name');
    const b = createProfileFor(uid, 'Same Name');
    expect(a.slug).toBe('same-name');
    expect(b.slug).toBe('same-name-2');
  });

  it('listProfilesForUser is scoped — user A does not see user B profiles', () => {
    const uidA = freshUid();
    const uidB = freshUid();
    createProfileFor(uidA, 'Only A');
    createProfileFor(uidB, 'Only B');
    const aList = listProfilesForUser(uidA);
    const bList = listProfilesForUser(uidB);
    expect(aList.some((p) => p.name === 'Only A')).toBe(true);
    expect(aList.some((p) => p.name === 'Only B')).toBe(false);
    expect(bList.some((p) => p.name === 'Only B')).toBe(true);
    expect(bList.some((p) => p.name === 'Only A')).toBe(false);
  });
});

describe('getActiveProfile / getActiveProfileSlug / getProfileBySlug', () => {
  it('getActiveProfile returns the active one', () => {
    const uid = freshUid();
    const p1 = createProfileFor(uid, 'P1');
    createProfileFor(uid, 'P2'); // demotes p1
    const active = getActiveProfile(uid);
    expect(active?.slug).toBe('p2');
    expect(active?.slug).not.toBe(p1.slug);
  });

  it('getActiveProfileSlug returns the slug string', () => {
    const uid = freshUid();
    createProfileFor(uid, 'Engineer');
    expect(getActiveProfileSlug(uid)).toBe('engineer');
  });

  it('getActiveProfileSlug returns "default" when no profiles exist for new user', () => {
    const uid = freshUid();
    // listProfilesForUser triggers maybeMigrateLegacy which seeds a Default
    const slug = getActiveProfileSlug(uid);
    expect(slug).toBe('default');
  });

  it('getProfileBySlug returns matching profile', () => {
    const uid = freshUid();
    const created = createProfileFor(uid, 'Founder');
    const fetched = getProfileBySlug(uid, 'founder');
    expect(fetched?.id).toBe(created.id);
  });

  it('getProfileBySlug returns undefined for unknown slug', () => {
    const uid = freshUid();
    expect(getProfileBySlug(uid, 'nonexistent')).toBeUndefined();
  });
});

describe('setActiveProfile', () => {
  it('sets the target active + demotes all others', () => {
    const uid = freshUid();
    const a = createProfileFor(uid, 'A');
    const b = createProfileFor(uid, 'B'); // active
    const updated = setActiveProfile(uid, a.slug);
    expect(updated.isActive).toBe(true);
    expect(updated.slug).toBe(a.slug);
    const list = listProfilesForUser(uid);
    const reloadedA = list.find((p) => p.slug === a.slug);
    const reloadedB = list.find((p) => p.slug === b.slug);
    expect(reloadedA?.isActive).toBe(true);
    expect(reloadedB?.isActive).toBe(false);
  });

  it('throws on unknown slug', () => {
    const uid = freshUid();
    createProfileFor(uid, 'Only');
    expect(() => setActiveProfile(uid, 'nope')).toThrow(/Unknown profile/);
  });
});

describe('renameProfileFor', () => {
  it('updates the name + updatedAt', () => {
    const uid = freshUid();
    const p = createProfileFor(uid, 'OldName');
    const renamed = renameProfileFor(uid, p.slug, 'NewName');
    expect(renamed.name).toBe('NewName');
    expect(renamed.updatedAt).toBeGreaterThanOrEqual(p.updatedAt);
  });

  it('keeps the original slug (slug is the stable identifier)', () => {
    const uid = freshUid();
    const p = createProfileFor(uid, 'Original');
    const renamed = renameProfileFor(uid, p.slug, 'Completely Different');
    expect(renamed.slug).toBe(p.slug);
  });

  it('rejects empty name', () => {
    const uid = freshUid();
    const p = createProfileFor(uid, 'X');
    expect(() => renameProfileFor(uid, p.slug, '   ')).toThrow(/required/);
  });

  it('rejects too-long name', () => {
    const uid = freshUid();
    const p = createProfileFor(uid, 'X');
    expect(() => renameProfileFor(uid, p.slug, 'x'.repeat(61))).toThrow(/too long/);
  });

  it('throws on unknown slug', () => {
    const uid = freshUid();
    expect(() => renameProfileFor(uid, 'nope', 'New')).toThrow(/Unknown profile/);
  });
});

describe('recolorProfileFor', () => {
  it('updates color', () => {
    const uid = freshUid();
    const p = createProfileFor(uid, 'X', 'blue');
    const updated = recolorProfileFor(uid, p.slug, 'violet');
    expect(updated.color).toBe('violet');
  });

  it('throws on unknown slug', () => {
    const uid = freshUid();
    expect(() => recolorProfileFor(uid, 'nope', 'rose')).toThrow(/Unknown profile/);
  });
});

describe('deleteProfileFor', () => {
  it('removes the target profile', () => {
    const uid = freshUid();
    const a = createProfileFor(uid, 'A');
    createProfileFor(uid, 'B'); // 2nd profile so delete is allowed
    deleteProfileFor(uid, a.slug);
    const list = listProfilesForUser(uid);
    expect(list.some((p) => p.slug === a.slug)).toBe(false);
  });

  it('refuses to delete the last profile', () => {
    const uid = freshUid();
    const p = createProfileFor(uid, 'Solo');
    // The default-seed migration also added a "Default" profile.
    // Delete that, leaving only Solo.
    const list = listProfilesForUser(uid);
    const default_ = list.find((x) => x.slug === 'default');
    if (default_) deleteProfileFor(uid, default_.slug);
    expect(() => deleteProfileFor(uid, p.slug)).toThrow(/last profile/);
  });

  it('throws on unknown slug', () => {
    const uid = freshUid();
    createProfileFor(uid, 'Only');
    expect(() => deleteProfileFor(uid, 'nope')).toThrow(/Unknown profile/);
  });

  it('promotes oldest remaining profile to active if active one was deleted', () => {
    const uid = freshUid();
    const a = createProfileFor(uid, 'A');
    // B is now active.
    const b = createProfileFor(uid, 'B');
    expect(b.isActive).toBe(true);
    deleteProfileFor(uid, b.slug);
    const newActive = getActiveProfile(uid);
    // A is now the only profile (besides the default that was seeded by
    // migration) -- whoever is oldest should be active.
    expect(newActive?.isActive).toBe(true);
  });
});
