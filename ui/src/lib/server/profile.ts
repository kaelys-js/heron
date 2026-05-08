/**
 * Read/write `config/profile.yml` — the user's single source of truth for personal data.
 * Uses the `yaml` library so comments and structure round-trip cleanly when possible.
 *
 * Mutations from the UI come in as a typed `ProfileEdit` patch and are merged into the
 * existing YAML document. Unknown / advanced fields are preserved as-is.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, readSafe, APPLICATIONS, PIPELINE, GEMINI_SCORES, REPORTS_DIR, OUTPUT_DIR,
} from './files';
import { parse, stringify } from 'yaml';

const PROFILE_PATH = path.join(ROOT, 'config', 'profile.yml');
const EXAMPLE_PATH = path.join(ROOT, 'config', 'profile.example.yml');
const MODES_PROFILE = path.join(ROOT, 'modes', '_profile.md');
const CV_PATH = path.join(ROOT, 'cv.md');

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

function readDoc(): Record<string, unknown> {
  try {
    if (!fs.existsSync(PROFILE_PATH)) {
      // Fall back to example so the UI has something to render on first run
      const example = readSafe(EXAMPLE_PATH);
      if (example) return parse(example) as Record<string, unknown>;
      return {};
    }
    return (parse(readSafe(PROFILE_PATH)) as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

export function readProfile(): ProfileSnapshot {
  const doc = readDoc();
  const candidate = (doc.candidate ?? {}) as ProfileEdit['candidate'] & Record<string, unknown>;
  const target_roles = (doc.target_roles ?? {}) as Record<string, unknown>;
  const narrative = (doc.narrative ?? {}) as ProfileEdit['narrative'] & Record<string, unknown>;
  const compensation = (doc.compensation ?? {}) as ProfileEdit['compensation'] & Record<string, unknown>;
  const location = (doc.location ?? {}) as ProfileEdit['location'] & Record<string, unknown>;
  const preferences = (doc.preferences ?? {}) as ProfileEdit['preferences'] & Record<string, unknown>;

  const archetypes = Array.isArray(target_roles.archetypes)
    ? (target_roles.archetypes as { name?: string; level?: string; fit?: string }[]).map((a) => ({
        name: a.name ?? '',
        level: a.level,
        fit: a.fit,
      }))
    : [];

  const proofPointsRaw = Array.isArray(narrative.proof_points)
    ? (narrative.proof_points as { name?: string; hero_metric?: string; url?: string; description?: string }[])
    : [];

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
      strong_plus: Array.isArray(preferences.strong_plus) ? (preferences.strong_plus as string[]) : [],
      hard_no: Array.isArray(preferences.hard_no) ? (preferences.hard_no as string[]) : [],
    },
    archetypes,
    exists: fs.existsSync(PROFILE_PATH),
    files: {
      profile: fileInfo(PROFILE_PATH),
      profileMd: fileInfo(MODES_PROFILE),
      cv: fileInfo(CV_PATH),
    },
  };
}

/**
 * Merge edit into the existing YAML document (preserving unknown keys + archetypes etc.)
 * and write back. Existing comments may be stripped because YAML round-trip via parse/stringify
 * doesn't preserve them — we accept that trade-off for v1; the user can always edit by hand.
 */
export function writeProfile(edit: ProfileEdit): ProfileSnapshot {
  const doc = readDoc();
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

  doc.candidate = merge((doc.candidate as Record<string, unknown>) ?? {}, edit.candidate as Record<string, unknown>);
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
  doc.compensation = merge((doc.compensation as Record<string, unknown>) ?? {}, edit.compensation as Record<string, unknown>);
  doc.location = merge((doc.location as Record<string, unknown>) ?? {}, edit.location as Record<string, unknown>);
  if (edit.preferences) {
    const p = (doc.preferences as Record<string, unknown>) ?? {};
    if (edit.preferences.must_have !== undefined) p.must_have = edit.preferences.must_have;
    if (edit.preferences.strong_plus !== undefined) p.strong_plus = edit.preferences.strong_plus;
    if (edit.preferences.hard_no !== undefined) p.hard_no = edit.preferences.hard_no;
    doc.preferences = p;
  }

  fs.mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
  const out = stringify(doc, { lineWidth: 100 });
  fs.writeFileSync(PROFILE_PATH, out);
  return readProfile();
}

/** Read companion files (modes/_profile.md, cv.md) for preview in the UI. */
export function readSiblingFile(name: 'profileMd' | 'cv'): string | null {
  const p = name === 'profileMd' ? MODES_PROFILE : CV_PATH;
  if (!fs.existsSync(p)) return null;
  return readSafe(p);
}

/**
 * Wipe the user's profile back to first-run state. Backs everything up to
 * `.bak` so a panicked user can recover by hand. Returns the list of files
 * that got reset so the API caller can describe what happened.
 *
 * Two scopes:
 *   - 'profile' (default) — only personal-info files
 *       config/profile.yml      → restored from config/profile.example.yml
 *       cv.md                   → deleted
 *       modes/_profile.md       → restored from modes/_profile.template.md
 *
 *   - 'everything' — also wipes the tracker / scan / project data
 *       all of the above PLUS:
 *       data/applications.md, data/pipeline.md, data/scan-history.tsv,
 *       data/gemini-scores.tsv, data/projects.json, data/autopilot.json,
 *       data/activity.jsonl
 *       reports/* and output/* (deep delete)
 *
 * What's NEVER touched even in 'everything':
 *   - .env (API keys; configured in Settings)
 *   - .venv (Python dependencies)
 *   - node_modules, .git, source code
 *   - .bak files (so the previous reset is still recoverable)
 *
 * Returns: { resetFiles, backups, scope }
 */
const PROFILE_TEMPLATE = path.join(ROOT, 'modes', '_profile.template.md');
const SCAN_HISTORY = path.join(ROOT, 'data', 'scan-history.tsv');
const PROJECTS_JSON = path.join(ROOT, 'data', 'projects.json');
const AUTOPILOT_JSON = path.join(ROOT, 'data', 'autopilot.json');
const ACTIVITY_JSONL = path.join(ROOT, 'data', 'activity.jsonl');

export type ResetScope = 'profile' | 'everything';
export type ResetResult = { resetFiles: string[]; backups: string[]; scope: ResetScope };

function backupTo(p: string, backups: string[]): void {
  if (!fs.existsSync(p)) return;
  try {
    fs.copyFileSync(p, p + '.bak');
    backups.push(p + '.bak');
  } catch {
    // Backup failure is non-fatal — caller has been warned via UI confirm.
  }
}

/** Empty a directory's contents but leave the directory itself (so other tools that index it don't break). */
function emptyDir(dir: string, resetFiles: string[], displayName: string) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir);
    let removed = 0;
    for (const name of entries) {
      // Skip backup files so a previous reset stays recoverable.
      if (name.endsWith('.bak')) continue;
      const full = path.join(dir, name);
      try {
        fs.rmSync(full, { recursive: true, force: true });
        removed++;
      } catch {}
    }
    if (removed > 0) resetFiles.push(displayName + ' (' + removed + ' files)');
  } catch {}
}

export function resetProfile(scope: ResetScope = 'profile'): ResetResult {
  const resetFiles: string[] = [];
  const backups: string[] = [];

  // ===== Always-wiped files (profile scope) =====

  // 1. profile.yml — restore from example if available, else clear
  backupTo(PROFILE_PATH, backups);
  if (fs.existsSync(EXAMPLE_PATH)) {
    fs.copyFileSync(EXAMPLE_PATH, PROFILE_PATH);
  } else if (fs.existsSync(PROFILE_PATH)) {
    fs.unlinkSync(PROFILE_PATH);
  }
  resetFiles.push('config/profile.yml');

  // 2. cv.md — delete
  backupTo(CV_PATH, backups);
  if (fs.existsSync(CV_PATH)) {
    fs.unlinkSync(CV_PATH);
    resetFiles.push('cv.md');
  }

  // 3. modes/_profile.md — restore from template
  backupTo(MODES_PROFILE, backups);
  if (fs.existsSync(PROFILE_TEMPLATE)) {
    fs.copyFileSync(PROFILE_TEMPLATE, MODES_PROFILE);
    resetFiles.push('modes/_profile.md');
  } else if (fs.existsSync(MODES_PROFILE)) {
    fs.unlinkSync(MODES_PROFILE);
    resetFiles.push('modes/_profile.md');
  }

  if (scope === 'profile') {
    return { resetFiles, backups, scope };
  }

  // ===== Deep wipe — tracker / scan / project / report / output =====

  // Tracker files: backup, then truncate to header-only state
  backupTo(APPLICATIONS, backups);
  fs.writeFileSync(
    APPLICATIONS,
    '# Applications Tracker\n\n| # | Date | Company | Role | URL | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-----|-------|--------|-----|--------|-------|\n',
  );
  resetFiles.push('data/applications.md');

  backupTo(PIPELINE, backups);
  if (fs.existsSync(PIPELINE)) {
    fs.writeFileSync(PIPELINE, '');
    resetFiles.push('data/pipeline.md');
  }

  for (const p of [SCAN_HISTORY, GEMINI_SCORES, PROJECTS_JSON, AUTOPILOT_JSON, ACTIVITY_JSONL]) {
    if (!fs.existsSync(p)) continue;
    backupTo(p, backups);
    try {
      fs.unlinkSync(p);
      resetFiles.push(path.relative(ROOT, p));
    } catch {}
  }

  // Reports + output PDFs — clear directories
  emptyDir(REPORTS_DIR, resetFiles, 'reports/');
  emptyDir(OUTPUT_DIR, resetFiles, 'output/');

  return { resetFiles, backups, scope };
}

/**
 * Overwrite cv.md (or modes/_profile.md). Always copies the previous file to
 * `<name>.bak` first so an accidental Replace can be recovered manually. The
 * user does not lose their old CV silently.
 *
 * Returns metadata so the caller can render a useful confirmation toast
 * ("12.4 KB written · previous version backed up to cv.md.bak").
 */
export type WriteResult = { bytes: number; backedUp: boolean; backupPath: string | null };
export function writeSiblingFile(name: 'profileMd' | 'cv', content: string): WriteResult {
  const p = name === 'profileMd' ? MODES_PROFILE : CV_PATH;
  let backedUp = false;
  let backupPath: string | null = null;
  if (fs.existsSync(p)) {
    try {
      fs.copyFileSync(p, p + '.bak');
      backedUp = true;
      backupPath = p + '.bak';
    } catch {
      // Backup failures are non-fatal — proceed with the write so the user
      // doesn't lose their new content. The bell will surface the read-failure
      // separately if it happens.
    }
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return { bytes: content.length, backedUp, backupPath };
}
