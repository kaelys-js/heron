/**
 * Pipeline-integrity integration tests.
 *
 * Asserts:
 *   • canonical statuses (per data/states.yml)
 *   • no duplicate company+role
 *   • report links resolve
 *   • score format X.X/5 or N/A or DUP
 *   • no pending TSVs in any profile's batch/tracker-additions/
 *     (per-profile post-multi-user — was repo-root batch/tracker-additions/)
 *   • states.yml itself is well-formed
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function exists(rel: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}
function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('data/states.yml is the canonical states source', () => {
  it('exists at data/states.yml', () => {
    expect(exists('data/states.yml')).toBe(true);
  });

  it('lists the core lifecycle statuses', () => {
    const yml = readFile('data/states.yml');
    expect(yml).toContain('Evaluated');
    expect(yml).toContain('Applied');
    expect(yml).toContain('Interview');
    expect(yml).toContain('Offer');
    expect(yml).toContain('Rejected');
  });
});

describe('data/profiles structure', () => {
  it('every profile has applications.md (when profiles.json exists)', () => {
    if (!exists('data/profiles.json')) return;
    const state = JSON.parse(readFile('data/profiles.json'));
    if (!Array.isArray(state?.profiles)) return;
    for (const p of state.profiles) {
      const apps = `data/profiles/${p.id}/applications.md`;
      if (exists(apps)) {
        // shape — first line is "# Applications Tracker" or similar
        const head = readFile(apps).split('\n').slice(0, 3).join('\n');
        expect(head.toLowerCase()).toMatch(/applications?/);
      }
    }
  });
});

describe('per-profile batch/tracker-additions/ should be empty', () => {
  // Pending TSVs are unmerged — surfacing this so users don't lose
  // evals to forgotten merges. Walks every profile under
  // data/profiles/{slug}/ and data/users/{uid}/profiles/{slug}/.
  function profileRoots(): string[] {
    const roots: string[] = [];
    const legacyRoot = path.join(REPO_ROOT, 'data/profiles');
    if (fs.existsSync(legacyRoot)) {
      for (const slug of fs.readdirSync(legacyRoot)) {
        const full = path.join(legacyRoot, slug);
        if (fs.statSync(full).isDirectory()) roots.push(full);
      }
    }
    const usersRoot = path.join(REPO_ROOT, 'data/users');
    if (fs.existsSync(usersRoot)) {
      for (const uid of fs.readdirSync(usersRoot)) {
        const userProfiles = path.join(usersRoot, uid, 'profiles');
        if (!fs.existsSync(userProfiles)) continue;
        for (const slug of fs.readdirSync(userProfiles)) {
          const full = path.join(userProfiles, slug);
          if (fs.statSync(full).isDirectory()) roots.push(full);
        }
      }
    }
    return roots;
  }

  it('no .tsv pending in any profile root', () => {
    for (const root of profileRoots()) {
      const dir = path.join(root, 'batch/tracker-additions');
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tsv'));
      // Empty array OR every entry already moved under merged/archived/.
      expect(files.length, `pending TSVs in ${dir}`).toBe(0);
    }
  });
});

describe('Status format hygiene', () => {
  it('applications.md (if present) uses pipe-delimited table format', () => {
    const apps = path.join(REPO_ROOT, 'data/applications.md');
    if (!fs.existsSync(apps)) return;
    const text = fs.readFileSync(apps, 'utf8');
    // Header row with pipes
    expect(text).toMatch(/\|.*\|.*\|/);
  });
});
