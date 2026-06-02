/**
 * about-info -- the pure assemblers behind the /about surface.
 *
 * Mirrors the Electron About (ui/electron/src/about-window.ts) minus the
 * desktop-only runtimes (electron / chromium / node) + the updater "channel"
 * (no iOS equivalent). Each function DROPS an absent part rather than render a
 * blank segment, so the surface never shows "Build  ()" / "iOS  · " on a build
 * where the value isn't there (a web build has no native bundle; a shallow
 * checkout has no SHA). Side-effect-free + unit-tested so the surface's
 * +page.svelte stays a thin renderer over these.
 */
import { BRAND } from './brand';
import type { DeviceFingerprint } from './capacitor-plugins';
import type { NativeBuildInfo } from './native-bridge';

export type AboutLink = { label: string; url: string };

/** The external-link row: Website / GitHub / Report a bug / License, derived
 *  from the brand repo block (single source -- a rebrand carries them). Opened
 *  via the Capacitor Browser plugin (openExternal). */
export function aboutLinks(): AboutLink[] {
  return [
    { label: 'Website', url: BRAND.repo.homepage },
    { label: 'GitHub', url: BRAND.repo.url },
    { label: 'Report a bug', url: BRAND.repo.issues },
    // The repo's LICENSE on the default branch -- no separate brand field for
    // it, so it's derived from the repo URL (same single source).
    { label: 'License', url: `${BRAND.repo.url}/blob/main/LICENSE` },
  ];
}

/** "iOS {osVersion} · {model}" from the device fingerprint, dropping the model
 *  when absent. Returns '' off native (no os / no version) so the caller hides
 *  the row entirely rather than showing "web · ". */
export function deviceLine(
  device: Pick<DeviceFingerprint, 'os' | 'osVersion' | 'model'> | null,
): string {
  if (!device || !device.os || !device.osVersion) {
    return '';
  }
  const head = `${device.os} ${device.osVersion}`;
  return device.model ? `${head} · ${device.model}` : head;
}

/** "Build {shortVersion} ({buildNumber})" from the native iOS bundle identity,
 *  or '' off iOS / when the fields are blank (the caller hides the row). */
export function nativeBundleLine(bundle: NativeBuildInfo | null): string {
  if (!bundle || !bundle.shortVersion || !bundle.buildNumber) {
    return '';
  }
  return `Build ${bundle.shortVersion} (${bundle.buildNumber})`;
}

export type DiagnosticsInput = {
  displayName: string;
  version: string;
  commit: string;
  /** Full ISO build timestamp (the copy payload carries the full value; the
   *  visible build-meta line shows only the day). */
  buildDate: string;
  bundle: NativeBuildInfo | null;
  device: Pick<DeviceFingerprint, 'os' | 'osVersion' | 'model'> | null;
};

/** The newline-joined "Copy diagnostics" payload a user pastes into a bug
 *  report. Bundles displayName + version + commit + buildDate + native bundle
 *  build# + device, dropping every absent part (mirrors the Electron About's
 *  copyText filter). */
export function diagnosticsPayload(info: DiagnosticsInput): string {
  const bundle = nativeBundleLine(info.bundle);
  const device = deviceLine(info.device);
  return [
    `${info.displayName} ${info.version}`,
    info.commit ? `Commit ${info.commit}` : '',
    info.buildDate ? `Build ${info.buildDate}` : '',
    bundle ? `Bundle ${info.bundle?.shortVersion} (${info.bundle?.buildNumber})` : '',
    device ? `Device ${device}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
