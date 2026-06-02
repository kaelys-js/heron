#!/usr/bin/env node
/**
 * pbxproj-version.mjs -- the PURE pbxproj version-stamp rewrite.
 *
 * The iOS Xcode project hardcoded MARKETING_VERSION (a mix of 0.1.0 / 1.0
 * across targets) and CURRENT_PROJECT_VERSION = 1 in
 * ui/ios/App/App.xcodeproj/project.pbxproj. Nothing synced them to the root
 * package.json, so the About surface's native bundle line
 * (CFBundleShortVersionString = $(MARKETING_VERSION),
 * CFBundleVersion = $(CURRENT_PROJECT_VERSION)) showed a stale version that
 * had no relation to the app's real semver.
 *
 * This helper rewrites BOTH for every target from a single source -- the
 * package.json semver:
 *
 *   - MARKETING_VERSION       = <semver>  (e.g. 1.4.2)  -> CFBundleShortVersionString
 *   - CURRENT_PROJECT_VERSION = <build #>               -> CFBundleVersion
 *
 * The build number is DERIVED from the semver (major*10000 + minor*100 +
 * patch), so it is:
 *   - monotonic across releases  (TestFlight requires an increasing
 *     CFBundleVersion; 1.4.2 -> 10402 > 1.4.1 -> 10401),
 *   - idempotent for a given version  (apply-brand reconciles the pbxproj on
 *     every dev startup; a per-run auto-increment would churn the working
 *     tree and break reproducible builds -- a deterministic derivation does
 *     neither).
 *
 * It's the SHARED rewrite used by two call sites: apply-brand.mjs's pbxproj
 * pass (reconciles from the current package.json on every brand apply) and
 * _bump-versions.mjs (stamps the resolved next version at release time).
 *
 * Mirrors the other scripts/native/*.mjs generators: a PURE helper (testable,
 * no I/O) -- the file read/write lives at the two call sites.
 */

/** PURE. Parse a semver core ("1.4.2", tolerating a "-pre"/"+meta" suffix and
 *  a leading "v") into its numeric major/minor/patch, or null when it isn't a
 *  recognisable semver. */
export function parseSemverCore(version) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? '').trim());
  if (!m) {
    return null;
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** PURE. Derive the integer CFBundleVersion build number from a semver:
 *  major*10000 + minor*100 + patch. Monotonic across releases AND idempotent
 *  for a given version (so apply-brand can reconcile the pbxproj every run
 *  without churning it). Throws on a non-semver input so a malformed version
 *  fails loud rather than silently stamping a bogus "0". */
export function buildNumberFromSemver(version) {
  const core = parseSemverCore(version);
  if (!core) {
    throw new Error(`pbxproj-version: not a semver: ${JSON.stringify(version)}`);
  }
  return core.major * 10000 + core.minor * 100 + core.patch;
}

/** PURE. Rewrite EVERY MARKETING_VERSION + CURRENT_PROJECT_VERSION occurrence
 *  in a pbxproj body to the values derived from `version` (package.json
 *  semver). Returns the rewritten body. Idempotent: stamping a body that is
 *  already current returns an identical string (the caller compares to decide
 *  whether to write). Throws on a non-semver version (fail loud).
 *
 *  Xcode writes MARKETING_VERSION both quoted ("1.0") and bare (1.0) depending
 *  on history; CURRENT_PROJECT_VERSION the same. We normalise to a BARE value
 *  for both (matching how Xcode emits integer/dotted values), so the regex
 *  tolerates an optional surrounding quote on the input. */
export function stampPbxprojVersion(body, version) {
  const marketing = parseSemverCore(version)
    ? // Re-emit the trimmed semver core+suffix WITHOUT a leading "v" so
      // CFBundleShortVersionString is a clean App Store version string.
      String(version).trim().replace(/^v/, '')
    : null;
  if (marketing === null) {
    throw new Error(`pbxproj-version: not a semver: ${JSON.stringify(version)}`);
  }
  const buildNumber = buildNumberFromSemver(version);
  return String(body)
    .replace(/MARKETING_VERSION = "?[^";\n]*"?;/g, `MARKETING_VERSION = ${marketing};`)
    .replace(
      /CURRENT_PROJECT_VERSION = "?[^";\n]*"?;/g,
      `CURRENT_PROJECT_VERSION = ${buildNumber};`,
    );
}
