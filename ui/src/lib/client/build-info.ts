/**
 * build-info -- the compile-time build identity, read once from the Vite
 * defines, plus the pure builder for the About surface's build-meta line.
 *
 * The three defines (`__APP_VERSION__` semver, `__APP_BUILD__` short git SHA,
 * `__APP_BUILD_DATE__` ISO timestamp) are folded to literals by vite.config.ts
 * and mirrored into vitest.base.ts. We `typeof`-guard each read (the same shape
 * hooks.server.ts uses) so this is safe in a test runner where a define isn't
 * applied -- consumers always get a string, never an undeclared-global throw.
 *
 * Distinct from native-bridge's getBuildInfo(): THIS is the WebView's
 * compile-time identity (what code was bundled). getBuildInfo() reads the iOS
 * bundle's CFBundleShortVersionString / CFBundleVersion (what binary is
 * running). The About surface shows both -- they can legitimately differ when a
 * WebView update ships ahead of a native rebuild.
 */

/** Compile-time build identity. Each field is '' when its define wasn't
 *  applied (a shallow / non-git checkout drops commit + date; some test
 *  runners drop all three). */
export type BuildInfo = {
  /** Semver from the root package.json (always present in a real build). */
  version: string;
  /** Short git SHA. '' on a shallow / non-git checkout. */
  commit: string;
  /** ISO build timestamp. '' where the define wasn't applied. */
  buildDate: string;
};

/** Read the compile-time build identity from the Vite defines. */
export function buildInfo(): BuildInfo {
  return {
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    commit: typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '',
    buildDate: typeof __APP_BUILD_DATE__ === 'string' ? __APP_BUILD_DATE__ : '',
  };
}

/** Pure builder for the compact build-provenance line:
 *  "v{version} · {commit} · {day}", dropping any missing part (mirrors the
 *  Electron About's buildMetaParts filter). The date is rendered as the
 *  calendar day only -- the full ISO timestamp lives in the copy-diagnostics
 *  payload, never the visible chrome, so a malformed value can't surface a
 *  time component. Returns '' when even the version is absent so the caller
 *  hides the line rather than rendering a bare "v". */
export function buildMetaLine(info: BuildInfo): string {
  const day = info.buildDate ? info.buildDate.slice(0, 10) : '';
  const parts = [info.version ? `v${info.version}` : '', info.commit, day].filter(Boolean);
  return parts.join(' · ');
}
