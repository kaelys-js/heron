// lib-profiles.mjs — Shared profile-path helpers for MJS scanners.
//
// Mirrors profile-paths.ts (TS) and lib_profiles.py (Python). Each MJS
// scanner imports this to resolve per-profile file paths off
// `data/profiles/{slug}/`.
//
// Usage:
//   import { resolveProfileArg, profilePath, ensureProfileDirs } from './lib-profiles.mjs';
//
//   const profileId = resolveProfileArg(args.profile);
//   const pipelineMd = profilePath(profileId, 'pipeline');

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = __dirname;
const PROFILES_JSON = path.join(ROOT, 'data', 'profiles.json');
const PROFILES_ROOT = path.join(ROOT, 'data', 'profiles');

const KINDS = {
  'cv-md': 'cv.md',
  'profile-yml': 'profile.yml',
  'profile-md': '_profile.md',
  'portals-yml': 'portals.yml',
  'article-digest': 'article-digest.md',
  pipeline: 'pipeline.md',
  applications: 'applications.md',
  'scan-history': 'scan-history.tsv',
  'gemini-scores': 'gemini-scores.tsv',
  'follow-ups': 'follow-ups.md',
  'projects-json': 'projects.json',
  'profile-dir': '',
  'reports-dir': 'reports',
  'output-dir': 'output',
  'interview-prep-dir': 'interview-prep',
};

export function readProfiles() {
  try {
    const text = fs.readFileSync(PROFILES_JSON, 'utf8');
    const parsed = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'activeId' in parsed &&
      Array.isArray(parsed.profiles)
    ) {
      return parsed;
    }
  } catch {
    // fallthrough to default
  }
  return {
    activeId: 'default',
    profiles: [{ id: 'default', name: 'Default', color: 'blue' }],
  };
}

export function getActiveProfileId() {
  return readProfiles().activeId || 'default';
}

export function listProfileIds() {
  return readProfiles()
    .profiles.map((p) => p.id)
    .filter(Boolean);
}

export function profilePath(profileId, kind) {
  if (!profileId || typeof profileId !== 'string') {
    throw new Error(`profilePath: profileId required (got ${JSON.stringify(profileId)})`);
  }
  if (profileId.includes('/') || profileId.includes('\\') || profileId.includes('..')) {
    throw new Error(`profilePath: invalid profileId (path traversal): ${profileId}`);
  }
  if (!(kind in KINDS)) {
    throw new Error(`profilePath: unknown kind ${kind}. Valid: ${Object.keys(KINDS).join(', ')}`);
  }
  const base = path.join(PROFILES_ROOT, profileId);
  const rel = KINDS[kind];
  return rel === '' ? base : path.join(base, rel);
}

export function ensureProfileDirs(profileId) {
  fs.mkdirSync(profilePath(profileId, 'profile-dir'), { recursive: true });
  fs.mkdirSync(profilePath(profileId, 'reports-dir'), { recursive: true });
  fs.mkdirSync(profilePath(profileId, 'output-dir'), { recursive: true });
  fs.mkdirSync(profilePath(profileId, 'interview-prep-dir'), { recursive: true });
}

/**
 * Resolve a `--profile <slug>` arg value (string or undefined) to an actual
 * profile id. Falls back to the active profile. Exits with code 2 if the
 * value names a profile that doesn't exist.
 */
export function resolveProfileArg(value) {
  if (value == null) return getActiveProfileId();
  const known = listProfileIds();
  if (!known.includes(value)) {
    console.error(
      `ERROR: unknown profile ${JSON.stringify(value)}. Known: ${JSON.stringify(known)}`,
    );
    process.exit(2);
  }
  return value;
}

/**
 * Parse a --profile arg from process.argv. Returns the resolved slug.
 * Tolerant of `--profile=<slug>` and `--profile <slug>` forms.
 */
export function profileFromArgv(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile' && i + 1 < argv.length) {
      return resolveProfileArg(argv[i + 1]);
    }
    if (a.startsWith('--profile=')) {
      return resolveProfileArg(a.slice('--profile='.length));
    }
  }
  return resolveProfileArg(undefined);
}
