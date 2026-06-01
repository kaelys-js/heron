/** Persisted update preferences + nag-control.
 *
 *  Two concerns live here, both backed by a single small JSON file in
 *  app.getPath('userData')/update-prefs.json:
 *
 *    1. Release channel -- 'stable' | 'beta'. Read at startup and mapped by
 *       updaterFlagsForChannel() to the electron-updater flags (allowPrerelease /
 *       allowDowngrade; the updater channel stays 'latest' -- see that helper for
 *       why the github provider cannot use a separate beta channel file). Written
 *       from the Settings UI / Help menu radio so the choice survives a restart.
 *    2. Nag-control -- the last version we already surfaced the styled changelog
 *       window for, plus a set of versions the user explicitly skipped. The
 *       window must not re-pop for the SAME version twice (auto-download fires
 *       update-downloaded on every launch until the user restarts), and a
 *       "Skip this version" click should suppress it for that version for good.
 *
 *  The PURE helpers (shouldShowForVersion, withShown, withSkipped, normalize,
 *  resolveChannel, updaterFlagsForChannel) are the testable core -- no electron /
 *  no fs. readUpdatePrefs
 *  / writeUpdatePrefs are the thin I/O wrappers the bootstrap calls; they never
 *  throw (a missing or corrupt file degrades to defaults), so a prefs problem can
 *  never break the updater or boot. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type UpdateChannel = 'stable' | 'beta';

export type UpdatePrefs = {
  channel: UpdateChannel;
  /** The version we last opened the changelog window for (any mode). */
  lastShownVersion: string;
  /** Versions the user clicked "Skip this version" on -- never re-surfaced. */
  skippedVersions: string[];
};

export const DEFAULT_PREFS: UpdatePrefs = {
  channel: 'stable',
  lastShownVersion: '',
  skippedVersions: [],
};

/** PURE. Coerce an unknown parsed-JSON value into a well-formed UpdatePrefs,
 *  filling defaults for any missing / wrong-typed field. A hand-edited or
 *  partially-written file can never produce an invalid in-memory shape. */
export function normalize(value: unknown): UpdatePrefs {
  const v = (value ?? {}) as Record<string, unknown>;
  const channel: UpdateChannel = v.channel === 'beta' ? 'beta' : 'stable';
  const lastShownVersion = typeof v.lastShownVersion === 'string' ? v.lastShownVersion : '';
  const skippedVersions = Array.isArray(v.skippedVersions)
    ? v.skippedVersions.filter((s): s is string => typeof s === 'string')
    : [];
  return { channel, lastShownVersion, skippedVersions };
}

/** PURE. Coerce an arbitrary string into a valid channel ('beta' wins only on an
 *  exact match; everything else -- including '' / undefined -- is 'stable'). */
export function resolveChannel(value: unknown): UpdateChannel {
  return value === 'beta' ? 'beta' : 'stable';
}

/** PURE. Map the user's channel choice to the electron-updater flags to apply.
 *  Heron's update feed is GitHub Releases, and electron-builder emits ONLY a
 *  single `latest.yml` for the `github` provider -- app-builder-lib's
 *  computeChannelNames hard-returns `[currentChannel]` when
 *  `provider === 'github'`, so a `beta.yml` is NEVER built (electron-builder's own
 *  note: "for GitHub the pre-release way should be used"). So the beta/stable split
 *  rides the prerelease FLAG, not a channel file: a beta opt-in keeps the updater
 *  channel at the default 'latest' and flips allowPrerelease on, and
 *  electron-updater then reads `latest.yml` off PRERELEASE releases. Setting
 *  `autoUpdater.channel = 'beta'` would make it fetch a `beta.yml` that does not
 *  exist -> beta users would get NO updates. allowDowngrade rides with the beta
 *  flag (preserves the prior behavior). */
export function updaterFlagsForChannel(channel: UpdateChannel): {
  channel: 'latest';
  allowPrerelease: boolean;
  allowDowngrade: boolean;
} {
  const beta = channel === 'beta';
  return { channel: 'latest', allowPrerelease: beta, allowDowngrade: beta };
}

/** PURE. Should the styled changelog window open for `version`?
 *  No when the version was explicitly skipped, OR when it's the same version we
 *  already showed (don't re-pop the same release on every relaunch). An empty
 *  version is treated as "unknown" and always allowed (electron-updater always
 *  carries a version, but defence-in-depth). */
export function shouldShowForVersion(prefs: UpdatePrefs, version: string): boolean {
  if (!version) {
    return true;
  }
  if (prefs.skippedVersions.includes(version)) {
    return false;
  }
  return prefs.lastShownVersion !== version;
}

/** PURE. Return prefs with `version` recorded as the last-shown one. */
export function withShown(prefs: UpdatePrefs, version: string): UpdatePrefs {
  if (!version || prefs.lastShownVersion === version) {
    return prefs;
  }
  return { ...prefs, lastShownVersion: version };
}

/** PURE. Return prefs with `version` added to the skipped set (deduped). */
export function withSkipped(prefs: UpdatePrefs, version: string): UpdatePrefs {
  if (!version || prefs.skippedVersions.includes(version)) {
    return prefs;
  }
  return { ...prefs, skippedVersions: [...prefs.skippedVersions, version] };
}

/** PURE. Return prefs with the channel set. */
export function withChannel(prefs: UpdatePrefs, channel: UpdateChannel): UpdatePrefs {
  return prefs.channel === channel ? prefs : { ...prefs, channel };
}

/** Read + normalize the prefs file. Never throws -- a missing / corrupt file
 *  yields DEFAULT_PREFS so the updater + boot always have a usable shape. */
export function readUpdatePrefs(filePath: string): UpdatePrefs {
  try {
    return normalize(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Write the prefs file (creating the parent dir if needed). Never throws -- a
 *  write failure (read-only userData, disk full) is non-fatal: the in-memory
 *  prefs still drive this session; only persistence across restart is lost. */
export function writeUpdatePrefs(filePath: string, prefs: UpdatePrefs): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(normalize(prefs), null, 2)}\n`, 'utf8');
  } catch {
    /* non-fatal -- see doc comment */
  }
}
