/**
 * update-prefs.test -- the persisted update-preferences store.
 *
 * The PURE helpers (normalize / resolveChannel / shouldShowForVersion /
 * withShown / withSkipped / withChannel) encode the nag-control + channel
 * policy; they're tested directly. readUpdatePrefs / writeUpdatePrefs are the
 * thin fs wrappers -- node:fs is mocked so we assert the degrade-to-defaults on
 * a missing/corrupt file and the never-throw write, since a prefs problem must
 * never break the updater or boot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: mocks.readFileSync,
  writeFileSync: mocks.writeFileSync,
  mkdirSync: mocks.mkdirSync,
}));

import {
  DEFAULT_PREFS,
  normalize,
  resolveChannel,
  shouldShowForVersion,
  updaterFlagsForChannel,
  withChannel,
  withShown,
  withSkipped,
  readUpdatePrefs,
  writeUpdatePrefs,
  type UpdatePrefs,
} from './update-prefs';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const prefs = (o: Partial<UpdatePrefs> = {}): UpdatePrefs => ({ ...DEFAULT_PREFS, ...o });

describe('normalize', () => {
  it('fills defaults for an empty / null value', () => {
    expect(normalize(undefined)).toEqual(DEFAULT_PREFS);
    expect(normalize(null)).toEqual(DEFAULT_PREFS);
    expect(normalize({})).toEqual(DEFAULT_PREFS);
  });

  it('keeps only the valid channel literal (beta on exact match, else stable)', () => {
    expect(normalize({ channel: 'beta' }).channel).toBe('beta');
    expect(normalize({ channel: 'stable' }).channel).toBe('stable');
    // WHY: a typo / hand-edit must not flip the updater into a downgrade-allowing
    // prerelease channel -- anything but the exact 'beta' literal is 'stable'.
    expect(normalize({ channel: 'Beta' }).channel).toBe('stable');
    expect(normalize({ channel: 42 }).channel).toBe('stable');
  });

  it('coerces a wrong-typed lastShownVersion / skippedVersions to defaults', () => {
    const n = normalize({ lastShownVersion: 99, skippedVersions: 'not-an-array' });
    expect(n.lastShownVersion).toBe('');
    expect(n.skippedVersions).toEqual([]);
  });

  it('drops non-string entries from skippedVersions', () => {
    expect(normalize({ skippedVersions: ['1.0.0', 5, null, '2.0.0'] }).skippedVersions).toEqual([
      '1.0.0',
      '2.0.0',
    ]);
  });
});

describe('resolveChannel', () => {
  it("returns 'beta' only on an exact match", () => {
    expect(resolveChannel('beta')).toBe('beta');
    expect(resolveChannel('stable')).toBe('stable');
    expect(resolveChannel('')).toBe('stable');
    expect(resolveChannel(undefined)).toBe('stable');
  });
});

describe('updaterFlagsForChannel', () => {
  // WHY this is pinned: Heron publishes to the GitHub provider, for which
  // electron-builder emits ONLY latest.yml (no beta.yml is ever built). So beta
  // MUST opt in via allowPrerelease with the updater channel left at 'latest'.
  // A prior version set autoUpdater.channel='beta', which made electron-updater
  // fetch a beta.yml that does not exist -> beta users silently got NO updates.
  // These assertions fail the moment someone reintroduces a 'beta' updater channel.
  it("beta rides allowPrerelease and keeps the updater channel 'latest' (never channel='beta')", () => {
    expect(updaterFlagsForChannel('beta')).toEqual({
      channel: 'latest',
      allowPrerelease: true,
      allowDowngrade: true,
    });
  });

  it('stable stays on latest with prereleases excluded', () => {
    expect(updaterFlagsForChannel('stable')).toEqual({
      channel: 'latest',
      allowPrerelease: false,
      allowDowngrade: false,
    });
  });
});

describe('shouldShowForVersion (nag-control)', () => {
  it('shows a fresh version that was neither shown nor skipped', () => {
    expect(shouldShowForVersion(prefs(), '1.5.0')).toBe(true);
  });

  it('does NOT re-show the version already shown (no double-pop on relaunch)', () => {
    // WHY: auto-download re-fires update-downloaded on every launch until the
    // user restarts; without this the styled window would re-open every boot.
    expect(shouldShowForVersion(prefs({ lastShownVersion: '1.5.0' }), '1.5.0')).toBe(false);
  });

  it('still shows a DIFFERENT version than the last-shown one', () => {
    expect(shouldShowForVersion(prefs({ lastShownVersion: '1.4.0' }), '1.5.0')).toBe(true);
  });

  it('never re-shows an explicitly skipped version', () => {
    expect(shouldShowForVersion(prefs({ skippedVersions: ['1.5.0'] }), '1.5.0')).toBe(false);
  });

  it('treats an empty version as unknown and shows it (defence-in-depth)', () => {
    expect(shouldShowForVersion(prefs({ lastShownVersion: '1.5.0' }), '')).toBe(true);
  });
});

describe('withShown / withSkipped / withChannel (immutable updates)', () => {
  it('records the last-shown version', () => {
    expect(withShown(prefs(), '1.5.0').lastShownVersion).toBe('1.5.0');
  });

  it('returns the SAME object when shown-version is unchanged or empty (no churn)', () => {
    const p = prefs({ lastShownVersion: '1.5.0' });
    expect(withShown(p, '1.5.0')).toBe(p);
    expect(withShown(p, '')).toBe(p);
  });

  it('adds a skipped version and dedupes', () => {
    const once = withSkipped(prefs(), '1.5.0');
    expect(once.skippedVersions).toEqual(['1.5.0']);
    // Adding the same version again is a no-op (same reference).
    expect(withSkipped(once, '1.5.0')).toBe(once);
    // Empty version is ignored.
    expect(withSkipped(once, '')).toBe(once);
  });

  it('accumulates distinct skipped versions', () => {
    const p = withSkipped(withSkipped(prefs(), '1.5.0'), '1.6.0');
    expect(p.skippedVersions).toEqual(['1.5.0', '1.6.0']);
  });

  it('sets the channel, returning the same object when unchanged', () => {
    const p = prefs();
    expect(withChannel(p, 'stable')).toBe(p);
    expect(withChannel(p, 'beta').channel).toBe('beta');
  });
});

describe('readUpdatePrefs', () => {
  it('parses + normalizes a valid file', () => {
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ channel: 'beta', lastShownVersion: '1.5.0', skippedVersions: ['1.4.0'] }),
    );
    expect(readUpdatePrefs('/u/update-prefs.json')).toEqual({
      channel: 'beta',
      lastShownVersion: '1.5.0',
      skippedVersions: ['1.4.0'],
    });
  });

  it('degrades to defaults on a missing file (read throws)', () => {
    mocks.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(readUpdatePrefs('/u/update-prefs.json')).toEqual(DEFAULT_PREFS);
  });

  it('degrades to defaults on a corrupt (non-JSON) file', () => {
    mocks.readFileSync.mockReturnValue('{ not json');
    expect(readUpdatePrefs('/u/update-prefs.json')).toEqual(DEFAULT_PREFS);
  });
});

describe('writeUpdatePrefs', () => {
  it('creates the parent dir + writes normalized JSON', () => {
    writeUpdatePrefs('/u/sub/update-prefs.json', prefs({ channel: 'beta' }));
    expect(mocks.mkdirSync).toHaveBeenCalledWith('/u/sub', { recursive: true });
    const [path, body] = mocks.writeFileSync.mock.calls[0];
    expect(path).toBe('/u/sub/update-prefs.json');
    expect(JSON.parse(String(body))).toEqual({
      channel: 'beta',
      lastShownVersion: '',
      skippedVersions: [],
    });
  });

  it('never throws when the write fails (read-only userData / disk full)', () => {
    mocks.writeFileSync.mockImplementation(() => {
      throw new Error('EROFS');
    });
    expect(() => writeUpdatePrefs('/u/update-prefs.json', prefs())).not.toThrow();
  });
});
