/**
 * Read/write per-profile `profile.yml`, `cv.md`, `_profile.md` + reset helpers.
 *
 * Every exported function takes an OPTIONAL `profileId` as its first argument.
 * When omitted, the active profile (from `data/profiles.json`) is used. This
 * keeps existing single-profile callers working unchanged while letting new
 * callers explicitly target a specific profile.
 *
 * Path resolution is centralised in `profile-paths.ts`. The flat-layout
 * constants previously imported from `files.ts` (CV_PATH, APPLICATIONS,
 * PIPELINE, …) are no longer used here — they're per-active-profile shims
 * for legacy callers and shouldn't be used from new code.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readSafe } from './files';
import { parse, stringify } from 'yaml';
import { logEvent } from './events';
import { profilePath, ensureProfileDirs } from './profile-paths';
import { getActiveProfileId } from './profiles';

/** Path to the example profile template — system-layer, shared, NOT per-profile. */
const EXAMPLE_PATH = path.join(ROOT, 'config', 'profile.example.yml');
/** Path to the `modes/_profile.md` template — system-layer, shared, NOT per-profile. */
const PROFILE_TEMPLATE = path.join(ROOT, 'modes', '_profile.template.md');

/** Subset of profile.yml that the UI exposes as editable. */
export type ProfileEdit = {
  candidate?: {
    full_name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    portfolio_url?: string;
    twitter?: string;
  };
  target_roles?: {
    primary?: string[];
  };
  narrative?: {
    headline?: string;
    exit_story?: string;
    superpowers?: string[];
    proof_points?: { name: string; hero_metric?: string; url?: string; description?: string }[];
  };
  compensation?: {
    target_range?: string;
    currency?: string;
    minimum?: string;
    location_flexibility?: string;
    notes?: string;
  };
  location?: {
    city?: string;
    province?: string;
    country?: string;
    timezone?: string;
    visa_status?: string;
    onsite_availability?: string;
  };
  preferences?: {
    must_have?: string[];
    strong_plus?: string[];
    hard_no?: string[];
  };
  /** Mode-file localization. Empty / 'modes' = English (modes/), otherwise
   *  'modes/<lang>' (one of 'modes/de', 'modes/fr', 'modes/ja', 'modes/pt',
   *  'modes/ru', 'modes/es'). Read by `modesPathFor()` to pick the right
   *  language directory; falls back to English when a specific .md is
   *  missing from the localized dir. */
  language?: {
    modes_dir?: string;
  };
  /** Autonomous apply settings — OPT-IN per profile. When `autonomous_apply`
   *  is true, the system MAY auto-submit applications on supported portals
   *  (LinkedIn / Greenhouse / Ashby) subject to score gate, daily cap, and
   *  per-portal toggles. See AGENTS.md "Ethical Use" + /help/autonomous-apply
   *  for the safety story. */
  automation?: {
    /** Master switch. Default false — must be explicitly enabled per profile. */
    autonomous_apply?: boolean;
    /** For the first N days after autonomous_apply flips on, the daily cap
     *  is reduced to 5/day (LinkedIn shadowban + ATS bot-filter mitigation). */
    warmup_days?: number;
    /** Minimum oferta / Gemini score required to autonomous-apply. Below this
     *  threshold the job stays at Scored regardless of autonomous_apply. */
    min_score_to_apply?: number;
    /** Which ATS portals this profile auto-applies via. Portals not listed
     *  here fall back to ManualApplyNeeded even when autonomous_apply is on. */
    enabled_portals?: string[];
    /** Timestamp (unix ms) when autonomous_apply was last flipped from
     *  false → true. Used to compute the warmup window. */
    enabled_at?: number;
  };
};

export type ProfileSnapshot = ProfileEdit & {
  /** True when the file exists; false on first run */
  exists: boolean;
  /** Raw archetypes array — surfaced read-only in the UI */
  archetypes: { name: string; level?: string; fit?: string }[];
  /** Path summaries for sibling files */
  files: {
    profile: { path: string; exists: boolean; size: number };
    profileMd: { path: string; exists: boolean; size: number };
    cv: { path: string; exists: boolean; size: number };
  };
};

function fileInfo(p: string) {
  try {
    const s = fs.statSync(p);
    return { path: p.replace(ROOT + '/', ''), exists: true, size: s.size };
  } catch {
    return { path: p.replace(ROOT + '/', ''), exists: false, size: 0 };
  }
}

/** Resolve a profileId argument to the actual profile id used downstream.
 *  Undefined → active. Caller never sees `undefined` past this point. */
function resolveId(profileId?: string): string {
  return profileId ?? getActiveProfileId();
}

function readDoc(profileId?: string): Record<string, unknown> {
  const id = resolveId(profileId);
  const p = profilePath(id, 'profile-yml');
  try {
    if (!fs.existsSync(p)) {
      // Fall back to example so the UI has something to render on first run
      const example = readSafe(EXAMPLE_PATH);
      if (example) return parse(example) as Record<string, unknown>;
      return {};
    }
    return (parse(readSafe(p)) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

export function readProfile(profileId?: string): ProfileSnapshot {
  const id = resolveId(profileId);
  const doc = readDoc(id);
  const candidate = (doc.candidate ?? {}) as ProfileEdit['candidate'] & Record<string, unknown>;
  const target_roles = (doc.target_roles ?? {}) as Record<string, unknown>;
  const narrative = (doc.narrative ?? {}) as ProfileEdit['narrative'] & Record<string, unknown>;
  const compensation = (doc.compensation ?? {}) as ProfileEdit['compensation'] &
    Record<string, unknown>;
  const location = (doc.location ?? {}) as ProfileEdit['location'] & Record<string, unknown>;
  const preferences = (doc.preferences ?? {}) as ProfileEdit['preferences'] &
    Record<string, unknown>;
  const language = (doc.language ?? {}) as { modes_dir?: string };
  const automation = (doc.automation ?? {}) as {
    autonomous_apply?: boolean;
    warmup_days?: number;
    min_score_to_apply?: number;
    enabled_portals?: string[];
    enabled_at?: number;
  };

  const archetypes = Array.isArray(target_roles.archetypes)
    ? (target_roles.archetypes as { name?: string; level?: string; fit?: string }[]).map((a) => ({
        name: a.name ?? '',
        level: a.level,
        fit: a.fit,
      }))
    : [];

  const proofPointsRaw = Array.isArray(narrative.proof_points)
    ? (narrative.proof_points as {
        name?: string;
        hero_metric?: string;
        url?: string;
        description?: string;
      }[])
    : [];

  const profilePathYml = profilePath(id, 'profile-yml');
  const profileMdPath = profilePath(id, 'profile-md');
  const cvPath = profilePath(id, 'cv-md');

  return {
    candidate: {
      full_name: candidate.full_name ?? '',
      email: candidate.email ?? '',
      phone: candidate.phone ?? '',
      location: candidate.location ?? '',
      linkedin: candidate.linkedin ?? '',
      github: candidate.github ?? '',
      portfolio_url: candidate.portfolio_url ?? '',
      twitter: candidate.twitter ?? '',
    },
    target_roles: {
      primary: Array.isArray(target_roles.primary) ? (target_roles.primary as string[]) : [],
    },
    narrative: {
      headline: narrative.headline ?? '',
      exit_story: narrative.exit_story ?? '',
      superpowers: Array.isArray(narrative.superpowers) ? (narrative.superpowers as string[]) : [],
      proof_points: proofPointsRaw.map((p) => ({
        name: p.name ?? '',
        hero_metric: p.hero_metric,
        url: p.url,
        description: p.description,
      })),
    },
    compensation: {
      target_range: compensation.target_range ?? '',
      currency: compensation.currency ?? '',
      minimum: compensation.minimum ?? '',
      location_flexibility: compensation.location_flexibility ?? '',
      notes: compensation.notes ?? '',
    },
    location: {
      city: location.city ?? '',
      province: location.province ?? '',
      country: location.country ?? '',
      timezone: location.timezone ?? '',
      visa_status: location.visa_status ?? '',
      onsite_availability: location.onsite_availability ?? '',
    },
    preferences: {
      must_have: Array.isArray(preferences.must_have) ? (preferences.must_have as string[]) : [],
      strong_plus: Array.isArray(preferences.strong_plus)
        ? (preferences.strong_plus as string[])
        : [],
      hard_no: Array.isArray(preferences.hard_no) ? (preferences.hard_no as string[]) : [],
    },
    language: {
      modes_dir: typeof language.modes_dir === 'string' ? language.modes_dir : '',
    },
    automation: {
      autonomous_apply: automation.autonomous_apply === true,
      warmup_days: typeof automation.warmup_days === 'number' ? automation.warmup_days : 7,
      min_score_to_apply:
        typeof automation.min_score_to_apply === 'number' ? automation.min_score_to_apply : 4.0,
      enabled_portals: Array.isArray(automation.enabled_portals)
        ? (automation.enabled_portals as string[])
        : ['linkedin', 'greenhouse', 'ashby'],
      enabled_at: typeof automation.enabled_at === 'number' ? automation.enabled_at : undefined,
    },
    archetypes,
    exists: fs.existsSync(profilePathYml),
    files: {
      profile: fileInfo(profilePathYml),
      profileMd: fileInfo(profileMdPath),
      cv: fileInfo(cvPath),
    },
  };
}

/**
 * Merge edit into the existing YAML document (preserving unknown keys + archetypes etc.)
 * and write back. Existing comments may be stripped because YAML round-trip via parse/stringify
 * doesn't preserve them — we accept that trade-off for v1; the user can always edit by hand.
 */
export function writeProfile(profileId: string | undefined, edit: ProfileEdit): ProfileSnapshot;
// Back-compat overload: callers that don't pass profileId pass edit as first arg.
export function writeProfile(edit: ProfileEdit): ProfileSnapshot;
export function writeProfile(
  arg1: string | ProfileEdit | undefined,
  arg2?: ProfileEdit,
): ProfileSnapshot {
  const profileId = typeof arg1 === 'string' ? arg1 : undefined;
  const edit = (typeof arg1 === 'string' ? arg2 : arg1) ?? {};
  const id = resolveId(profileId);
  ensureProfileDirs(id);
  const doc = readDoc(id);
  // Helper: merge two plain objects shallowly
  const merge = <T extends Record<string, unknown>>(base: T, patch: Partial<T> | undefined): T => {
    if (!patch) return base;
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      out[k] = v;
    }
    return out as T;
  };

  doc.candidate = merge(
    (doc.candidate as Record<string, unknown>) ?? {},
    edit.candidate as Record<string, unknown>,
  );
  if (edit.target_roles) {
    const tr = (doc.target_roles as Record<string, unknown>) ?? {};
    if (edit.target_roles.primary !== undefined) tr.primary = edit.target_roles.primary;
    doc.target_roles = tr;
  }
  if (edit.narrative) {
    const n = (doc.narrative as Record<string, unknown>) ?? {};
    const e = edit.narrative;
    if (e.headline !== undefined) n.headline = e.headline;
    if (e.exit_story !== undefined) n.exit_story = e.exit_story;
    if (e.superpowers !== undefined) n.superpowers = e.superpowers;
    if (e.proof_points !== undefined) n.proof_points = e.proof_points;
    doc.narrative = n;
  }
  doc.compensation = merge(
    (doc.compensation as Record<string, unknown>) ?? {},
    edit.compensation as Record<string, unknown>,
  );
  doc.location = merge(
    (doc.location as Record<string, unknown>) ?? {},
    edit.location as Record<string, unknown>,
  );
  if (edit.preferences) {
    const p = (doc.preferences as Record<string, unknown>) ?? {};
    if (edit.preferences.must_have !== undefined) p.must_have = edit.preferences.must_have;
    if (edit.preferences.strong_plus !== undefined) p.strong_plus = edit.preferences.strong_plus;
    if (edit.preferences.hard_no !== undefined) p.hard_no = edit.preferences.hard_no;
    doc.preferences = p;
  }
  if (edit.language) {
    const l = (doc.language as Record<string, unknown>) ?? {};
    if (edit.language.modes_dir !== undefined) l.modes_dir = edit.language.modes_dir;
    doc.language = l;
  }
  if (edit.automation) {
    const a = (doc.automation as Record<string, unknown>) ?? {};
    const before = a.autonomous_apply === true;
    if (edit.automation.autonomous_apply !== undefined)
      a.autonomous_apply = edit.automation.autonomous_apply;
    if (edit.automation.warmup_days !== undefined) a.warmup_days = edit.automation.warmup_days;
    if (edit.automation.min_score_to_apply !== undefined)
      a.min_score_to_apply = edit.automation.min_score_to_apply;
    if (edit.automation.enabled_portals !== undefined)
      a.enabled_portals = edit.automation.enabled_portals;
    // Stamp enabled_at when flipping false → true so the warmup window starts ticking.
    if (!before && edit.automation.autonomous_apply === true) a.enabled_at = Date.now();
    doc.automation = a;
  }

  const out = stringify(doc, { lineWidth: 100 });
  fs.writeFileSync(profilePath(id, 'profile-yml'), out);
  return readProfile(id);
}

/** Read companion files (modes/_profile.md, cv.md) for preview in the UI. */
export function readSiblingFile(
  profileId: string | undefined,
  name: 'profileMd' | 'cv',
): string | null;
export function readSiblingFile(name: 'profileMd' | 'cv'): string | null;
export function readSiblingFile(
  arg1: string | undefined | 'profileMd' | 'cv',
  arg2?: 'profileMd' | 'cv',
): string | null {
  // Disambiguate the overloads. The legacy signature passes 'profileMd'/'cv' as
  // the first arg; the new signature passes a profile id.
  let profileId: string | undefined;
  let name: 'profileMd' | 'cv';
  if (arg2 !== undefined) {
    profileId = arg1 as string | undefined;
    name = arg2;
  } else {
    profileId = undefined;
    name = arg1 as 'profileMd' | 'cv';
  }
  const id = resolveId(profileId);
  const p = name === 'profileMd' ? profilePath(id, 'profile-md') : profilePath(id, 'cv-md');
  if (!fs.existsSync(p)) return null;
  return readSafe(p);
}

/**
 * Wipe the user's profile back to first-run state. Backs everything up to
 * `.bak` so a panicked user can recover by hand. Returns the list of files
 * that got reset so the API caller can describe what happened.
 *
 * Three scopes:
 *   - 'profile'    → wipes that profile's profile.yml + cv.md + _profile.md
 *                    only. Tracker/pipeline/sources/reports preserved.
 *                    Shared infrastructure UNTOUCHED.
 *   - 'jobs'       → wipes that profile's job-search artifacts:
 *                    applications.md, pipeline.md, scan-history.tsv,
 *                    gemini-scores.tsv, follow-ups.md, reports/, output/,
 *                    interview-prep/{company}-*.md. Profile YAML / CV /
 *                    targeting / sources connections preserved.
 *                    Shared infrastructure UNTOUCHED.
 *   - 'everything' → strict superset of both, plus that profile's
 *                    projects.json AND shared infrastructure listed below.
 *
 * Shared infrastructure ALSO wiped on scope='everything' (per the
 * ResetProfileDialog's "Everything — what happens" description). The
 * 'profile' and 'jobs' scopes do NOT touch these:
 *   data/autopilot.json     ← reset to DEFAULT_CONFIG
 *   data/activity.jsonl     ← truncated
 *   data/job-last-run.json  ← deleted
 *   data/apply-counter.json ← deleted
 *   interview-prep/story-bank.md ← deleted
 *
 * Shared files NEVER touched by ANY scope:
 *   data/issues.jsonl       ← open-issues feed (driver: liveness, integrity)
 *   data/sources.json       ← source connection state
 *   data/onboarding-state.json  ← wizard state (Phase 5 handles this separately)
 *   data/profiles.json      ← profile registry
 *   data/followup-cache.json + patterns-cache.json ← derived caches
 *   .env, .venv, .playwright-<portal> dirs, node_modules, .git, source code
 *   .bak siblings           ← so previous resets stay recoverable
 *
 * Returns: { resetFiles, backups, scope, profileId }
 */
export type ResetScope = 'profile' | 'jobs' | 'everything';
export type ResetResult = {
  resetFiles: string[];
  backups: string[];
  scope: ResetScope;
  profileId: string;
};

function backupTo(p: string, backups: string[]): void {
  if (!fs.existsSync(p)) return;
  try {
    fs.copyFileSync(p, p + '.bak');
    backups.push(p + '.bak');
  } catch {
    // Backup failure is non-fatal — caller has been warned via UI confirm.
  }
}

/** Empty a directory's contents but leave the directory itself (so other tools that index it don't break).
 *  Before each delete the file/subtree is backed up to `<path>.bak` (file)
 *  or `<path>.bak.tar` (directory subtree) so a panicked user can recover.
 *  Skip the backup if `.bak` already exists — don't clobber the previous one.
 *  `exclude` is an optional set of basenames to leave untouched — used by the 'jobs' scope to keep
 *  long-lived artifacts like interview-prep/story-bank.md while still wiping company-specific files. */
function emptyDir(dir: string, resetFiles: string[], displayName: string, exclude?: Set<string>) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir);
    let removed = 0;
    let failed = 0;
    for (const name of entries) {
      // Skip backup files so a previous reset stays recoverable.
      if (name.endsWith('.bak')) continue;
      if (exclude?.has(name)) continue;
      const full = path.join(dir, name);
      // Per-entry backup. For plain files we copyFileSync to a .bak sibling.
      // For directories we recursively copy to <name>.bak/. Both are skipped
      // when a .bak already exists so a previous reset stays recoverable.
      try {
        const stat = fs.statSync(full);
        const bakPath = full + '.bak';
        if (!fs.existsSync(bakPath)) {
          if (stat.isDirectory()) {
            fs.cpSync(full, bakPath, { recursive: true });
          } else {
            fs.copyFileSync(full, bakPath);
          }
        }
      } catch (e) {
        // Backup failure is non-fatal — still attempt the delete.
        logEvent('reset-profile', 'Could not back up ' + name, {
          level: 'warn',
          category: 'application',
          message: displayName + ' — ' + (e instanceof Error ? e.message : String(e)),
        });
      }
      try {
        fs.rmSync(full, { recursive: true, force: true });
        removed++;
      } catch (e) {
        failed++;
        // Log per-file failure at warn — user expects "reset" to clear and
        // a partial reset is misleading without a signal.
        logEvent('reset-profile', 'Could not remove ' + name, {
          level: 'warn',
          category: 'application',
          message: displayName + ' — ' + (e instanceof Error ? e.message : String(e)),
        });
      }
    }
    if (removed > 0) resetFiles.push(displayName + ' (' + removed + ' files)');
    if (failed > 0) {
      logEvent('reset-profile', 'Partial reset of ' + displayName, {
        level: 'warn',
        category: 'application',
        message: removed + ' removed · ' + failed + ' failed (see warnings above)',
      });
    }
  } catch (e) {
    logEvent('reset-profile', 'Could not enumerate ' + displayName, {
      level: 'warn',
      category: 'application',
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Backup + delete a single file. No-op if the file doesn't exist. */
function backupAndDelete(p: string, resetFiles: string[], backups: string[]): void {
  if (!fs.existsSync(p)) return;
  backupTo(p, backups);
  try {
    fs.unlinkSync(p);
    resetFiles.push(path.relative(ROOT, p));
  } catch (e) {
    logEvent('reset-profile', 'Could not delete ' + path.basename(p), {
      level: 'warn',
      category: 'application',
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export function resetProfile(profileId: string | undefined, scope?: ResetScope): ResetResult;
export function resetProfile(scope?: ResetScope): ResetResult;
export function resetProfile(arg1?: string | ResetScope, arg2?: ResetScope): ResetResult {
  const isFirstArgScope = arg1 === 'profile' || arg1 === 'jobs' || arg1 === 'everything';
  const profileId = isFirstArgScope ? undefined : (arg1 as string | undefined);
  const scope: ResetScope = isFirstArgScope ? (arg1 as ResetScope) : (arg2 ?? 'profile');
  const id = resolveId(profileId);
  const resetFiles: string[] = [];
  const backups: string[] = [];

  const PROFILE_YML = profilePath(id, 'profile-yml');
  const CV_MD = profilePath(id, 'cv-md');
  const PROFILE_MD = profilePath(id, 'profile-md');
  const APPLICATIONS_MD = profilePath(id, 'applications');
  const PIPELINE_MD = profilePath(id, 'pipeline');
  const SCAN_HISTORY_TSV = profilePath(id, 'scan-history');
  const GEMINI_SCORES_TSV = profilePath(id, 'gemini-scores');
  const FOLLOW_UPS_MD = profilePath(id, 'follow-ups');
  const PROJECTS_JSON_PATH = profilePath(id, 'projects-json');
  const REPORTS_DIR = profilePath(id, 'reports-dir');
  const OUTPUT_DIR = profilePath(id, 'output-dir');
  const INTERVIEW_PREP_DIR = profilePath(id, 'interview-prep-dir');

  // ===== Profile-only block =====
  if (scope === 'profile' || scope === 'everything') {
    backupTo(PROFILE_YML, backups);
    if (fs.existsSync(EXAMPLE_PATH)) {
      fs.copyFileSync(EXAMPLE_PATH, PROFILE_YML);
    } else if (fs.existsSync(PROFILE_YML)) {
      fs.unlinkSync(PROFILE_YML);
    }
    resetFiles.push(path.relative(ROOT, PROFILE_YML));

    backupTo(CV_MD, backups);
    if (fs.existsSync(CV_MD)) {
      fs.unlinkSync(CV_MD);
      resetFiles.push(path.relative(ROOT, CV_MD));
    }

    backupTo(PROFILE_MD, backups);
    if (fs.existsSync(PROFILE_TEMPLATE)) {
      fs.copyFileSync(PROFILE_TEMPLATE, PROFILE_MD);
      resetFiles.push(path.relative(ROOT, PROFILE_MD));
    } else if (fs.existsSync(PROFILE_MD)) {
      fs.unlinkSync(PROFILE_MD);
      resetFiles.push(path.relative(ROOT, PROFILE_MD));
    }
  }

  if (scope === 'profile') {
    return { resetFiles, backups, scope, profileId: id };
  }

  // ===== Job-search artifacts block =====
  backupTo(APPLICATIONS_MD, backups);
  fs.mkdirSync(path.dirname(APPLICATIONS_MD), { recursive: true });
  fs.writeFileSync(
    APPLICATIONS_MD,
    '# Applications Tracker\n\n| # | Date | Company | Role | URL | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-----|-------|--------|-----|--------|-------|\n',
  );
  resetFiles.push(path.relative(ROOT, APPLICATIONS_MD));

  backupTo(PIPELINE_MD, backups);
  if (fs.existsSync(PIPELINE_MD)) {
    fs.writeFileSync(PIPELINE_MD, '');
    resetFiles.push(path.relative(ROOT, PIPELINE_MD));
  }

  for (const p of [SCAN_HISTORY_TSV, GEMINI_SCORES_TSV, FOLLOW_UPS_MD]) {
    backupAndDelete(p, resetFiles, backups);
  }

  emptyDir(REPORTS_DIR, resetFiles, path.relative(ROOT, REPORTS_DIR) + '/');
  emptyDir(OUTPUT_DIR, resetFiles, path.relative(ROOT, OUTPUT_DIR) + '/');

  // Per-profile interview-prep dir — story-bank.md was never moved here by
  // migration (it stays at the shared top-level path), but a future per-profile
  // story-bank.md could exist; preserve it under 'jobs' scope to be safe.
  if (scope === 'jobs') {
    emptyDir(
      INTERVIEW_PREP_DIR,
      resetFiles,
      path.relative(ROOT, INTERVIEW_PREP_DIR) + '/',
      new Set(['story-bank.md']),
    );
  } else {
    emptyDir(INTERVIEW_PREP_DIR, resetFiles, path.relative(ROOT, INTERVIEW_PREP_DIR) + '/');
  }

  if (scope === 'jobs') {
    return { resetFiles, backups, scope, profileId: id };
  }

  // ===== Everything-only block =====
  // This profile's saved filter views.
  backupAndDelete(PROJECTS_JSON_PATH, resetFiles, backups);

  // Shared infrastructure — wiped per the ResetProfileDialog "Everything"
  // description. Each gets backed up to <path>.bak before deletion/reset.
  const AUTOPILOT_JSON = path.join(ROOT, 'data', 'autopilot.json');
  const ACTIVITY_JSONL = path.join(ROOT, 'data', 'activity.jsonl');
  const JOB_LAST_RUN_JSON = path.join(ROOT, 'data', 'job-last-run.json');
  const APPLY_COUNTER_JSON = path.join(ROOT, 'data', 'apply-counter.json');
  const STORY_BANK_MD = path.join(ROOT, 'interview-prep', 'story-bank.md');

  // Reset autopilot.json to defaults rather than deleting it — the
  // scheduler depends on the file existing on next read; rewriting to
  // DEFAULT_CONFIG is more honest than deleting and racing with the
  // scheduler's next tick.
  if (fs.existsSync(AUTOPILOT_JSON)) {
    backupTo(AUTOPILOT_JSON, backups);
    try {
      // Lazy-require to avoid circular imports.
      const { readConfig: _read, writeConfig } =
        require('./autopilot') as typeof import('./autopilot');
      void _read;
      // Force-write the static defaults by deleting and triggering a fresh read.
      // Simpler: just delete; next readConfig() seeds DEFAULT_CONFIG automatically.
      fs.unlinkSync(AUTOPILOT_JSON);
      // Re-seed defaults so the file exists for the scheduler's next tick.
      const fresh = (require('./autopilot') as typeof import('./autopilot')).readConfig();
      writeConfig(fresh);
      resetFiles.push(path.relative(ROOT, AUTOPILOT_JSON));
    } catch (e) {
      logEvent('reset-profile', 'Could not reset autopilot.json', {
        level: 'warn',
        category: 'application',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Activity feed — backup then truncate (preserve file so the bus's append
  // path doesn't need to recreate it on next emit).
  if (fs.existsSync(ACTIVITY_JSONL)) {
    backupTo(ACTIVITY_JSONL, backups);
    try {
      fs.writeFileSync(ACTIVITY_JSONL, '');
      resetFiles.push(path.relative(ROOT, ACTIVITY_JSONL));
    } catch (e) {
      logEvent('reset-profile', 'Could not truncate activity.jsonl', {
        level: 'warn',
        category: 'application',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  backupAndDelete(JOB_LAST_RUN_JSON, resetFiles, backups);
  backupAndDelete(APPLY_COUNTER_JSON, resetFiles, backups);
  backupAndDelete(STORY_BANK_MD, resetFiles, backups);

  return { resetFiles, backups, scope, profileId: id };
}

/**
 * Overwrite cv.md (or _profile.md) for the given profile. Always copies the
 * previous file to `<name>.bak` first so an accidental Replace can be
 * recovered manually. The user does not lose their old CV silently.
 */
export type WriteResult = { bytes: number; backedUp: boolean; backupPath: string | null };
export function writeSiblingFile(
  profileId: string | undefined,
  name: 'profileMd' | 'cv',
  content: string,
): WriteResult;
export function writeSiblingFile(name: 'profileMd' | 'cv', content: string): WriteResult;
export function writeSiblingFile(
  arg1: string | undefined | 'profileMd' | 'cv',
  arg2: 'profileMd' | 'cv' | string,
  arg3?: string,
): WriteResult {
  // Disambiguate: 3-arg form is (profileId, name, content); 2-arg form is (name, content).
  let profileId: string | undefined;
  let name: 'profileMd' | 'cv';
  let content: string;
  if (arg3 !== undefined) {
    profileId = arg1 as string | undefined;
    name = arg2 as 'profileMd' | 'cv';
    content = arg3;
  } else {
    profileId = undefined;
    name = arg1 as 'profileMd' | 'cv';
    content = arg2 as string;
  }
  const id = resolveId(profileId);
  ensureProfileDirs(id);
  const p = name === 'profileMd' ? profilePath(id, 'profile-md') : profilePath(id, 'cv-md');
  let backedUp = false;
  let backupPath: string | null = null;
  if (fs.existsSync(p)) {
    try {
      fs.copyFileSync(p, p + '.bak');
      backedUp = true;
      backupPath = p + '.bak';
    } catch {
      // Backup failures are non-fatal — proceed with the write so the user
      // doesn't lose their new content.
    }
  }
  fs.writeFileSync(p, content);
  return { bytes: content.length, backedUp, backupPath };
}
