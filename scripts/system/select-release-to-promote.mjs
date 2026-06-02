#!/usr/bin/env node
/**
 * select-release-to-promote -- the PURE decision for the auto-promote-after-soak
 * step of the cross-platform release model (see docs/RELEASING.md).
 *
 * The model: a Release Please cut (vX.Y.Z) publishes to every BETA track
 * (iOS TestFlight, Android Play internal, Electron beta channel). After a soak
 * window the SAME version is auto-promoted to every PRODUCTION track (App Store
 * phased, Play staged, Electron stable + stagingPercentage). This module decides
 * WHICH version that scheduled job should promote -- or none.
 *
 * It is deliberately pure (no network / fs / clock): the workflow gathers the
 * inputs (gh release list, the open-release-blocker check, the promoted markers)
 * and passes them in, so the safety-critical logic is fully unit-tested.
 *
 * Used by .github/workflows/promote.yml.
 */

/** Numeric semver `a > b` over X.Y.Z (ignores any prerelease/build suffix).
 *  Lexical compare would rank 0.9.0 above 0.10.0 -- this doesn't. */
export function semverGt(a, b) {
  const parse = (v) =>
    String(v)
      .replace(/^v/, '')
      .split('-')[0]
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

const DAY_MS = 86_400_000;

/**
 * Decide which beta version (if any) to promote to production.
 *
 * @param {object} o
 * @param {Array<{version:string, publishedAtMs:number, isPrerelease:boolean, labels:string[]}>} o.releases
 * @param {number} o.nowMs               current time (ms)
 * @param {number} o.soakDays            minimum age before a beta can promote
 * @param {string[]} o.promotedVersions  versions already in production
 * @param {boolean} o.globalHold         true iff an open `release-blocker` issue exists
 * @returns {{version: string|null, reason: string}}
 */
export function selectReleaseToPromote({
  releases,
  nowMs,
  soakDays,
  promotedVersions = [],
  globalHold = false,
}) {
  // 1. A repo-wide hold (an open `release-blocker` issue) freezes ALL promotion.
  if (globalHold) {
    return { version: null, reason: 'blocked: an open release-blocker issue holds all promotion' };
  }

  // 2. The production high-water mark -- never regress below it.
  const maxPromoted = promotedVersions.reduce((m, v) => (m && semverGt(m, v) ? m : v), '');

  // 3. Eligible candidates: a beta cut (prerelease) that has soaked long enough,
  //    isn't on hold, isn't already promoted, and is newer than production.
  const soakMs = soakDays * DAY_MS;
  const eligible = (releases ?? []).filter((r) => {
    if (!r.isPrerelease) return false; // only beta cuts
    if ((r.labels ?? []).includes('hold-promotion')) return false; // maintainer hold
    if (promotedVersions.includes(r.version)) return false; // idempotency
    if (nowMs - r.publishedAtMs < soakMs) return false; // still soaking
    if (maxPromoted && !semverGt(r.version, maxPromoted)) return false; // no regress
    return true;
  });

  if (eligible.length === 0) {
    return {
      version: null,
      reason: 'no candidate: none soaked-and-eligible (too fresh / held / promoted)',
    };
  }

  // 4. Promote the HIGHEST eligible version (a newer still-soaking beta waits for
  //    its own window on a later run).
  const best = eligible.reduce((m, r) => (semverGt(r.version, m.version) ? r : m));
  return {
    version: best.version,
    reason: `promote ${best.version} (soaked >= ${soakDays}d, not held/promoted)`,
  };
}
