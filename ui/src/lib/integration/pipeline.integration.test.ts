/**
 * Integration replacement for `verify-pipeline.mjs` (Phase 5).
 *
 * Asserts pipeline integrity:
 *   • canonical statuses (per templates/states.yml)
 *   • no duplicate company+role
 *   • report links resolve
 *   • score format X.X/5 or N/A or DUP
 *   • no pending TSVs in batch/tracker-additions/
 *   • states.yml itself is well-formed
 *
 * Spawns the legacy verifier as the parity oracle.
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

describe('templates/states.yml is the canonical states source', () => {
  it('exists at templates/states.yml', () => {
    expect(exists('templates/states.yml')).toBe(true);
  });

  it('lists the core lifecycle statuses', () => {
    const yml = readFile('templates/states.yml');
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

describe('batch/tracker-additions/ should be empty', () => {
  // Pending TSVs in the additions dir are unmerged — the verifier
  // surfaces this so users don't lose evals to forgotten merges.
  it('no .tsv pending in batch/tracker-additions/ root', () => {
    const dir = path.join(REPO_ROOT, 'batch/tracker-additions');
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tsv'));
    // Empty array OR every entry should already be moved under merged/ or
    // archived/ subdirs (which the verifier accepts).
    expect(files.length).toBe(0);
  });
});

describe('Parity with legacy verify-pipeline.mjs', () => {
  it('legacy verifier exits 0 against the current repo state', () => {
    const p = path.join(REPO_ROOT, 'verify-pipeline.mjs');
    if (!fs.existsSync(p)) return;
    let exitCode = 0;
    try {
      execSync(`node "${p}"`, {
        cwd: REPO_ROOT,
        stdio: 'pipe',
        timeout: 30_000,
      });
    } catch (e: any) {
      exitCode = e.status ?? 1;
    }
    expect(exitCode).toBe(0);
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
