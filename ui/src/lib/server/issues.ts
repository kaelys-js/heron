/**
 * Issue stream — append-only persistent queue of "open problems" that need
 * user attention. Distinct from the activity feed (transient information):
 * issues live in data/issues.jsonl and stay visible until explicitly resolved.
 *
 * Use cases:
 *   - Pipeline integrity checker found 3 invalid statuses → 1 issue
 *   - Liveness sweep flagged 4 uncertain URLs → 1 issue
 *   - Autopilot circuit-breaker tripped → 1 issue
 *   - Profile YAML failed to parse → 1 issue
 *
 * The dedupeKey contract: when a job re-detects the same problem class on a
 * later run, it passes a stable dedupeKey. We rewrite the file in place so
 * the open list always shows ONE row for that key (the latest detection),
 * not a growing log of duplicates.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from './files';
import type { Issue } from '$lib/types';

const ISSUES_PATH = path.join(ROOT, 'data', 'issues.jsonl');

function ensureDir() {
  try {
    fs.mkdirSync(path.dirname(ISSUES_PATH), { recursive: true });
  } catch {}
}

function readAll(): Issue[] {
  try {
    if (!fs.existsSync(ISSUES_PATH)) return [];
    const txt = fs.readFileSync(ISSUES_PATH, 'utf8');
    const out: Issue[] = [];
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line) as Issue;
        if (ev.id && ev.ts) out.push(ev);
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

function writeAll(issues: Issue[]): void {
  ensureDir();
  fs.writeFileSync(
    ISSUES_PATH,
    issues.map((i) => JSON.stringify(i)).join('\n') + (issues.length ? '\n' : ''),
  );
}

function appendOne(issue: Issue): void {
  ensureDir();
  fs.appendFileSync(ISSUES_PATH, JSON.stringify(issue) + '\n');
}

/**
 * Report a new issue (or refresh an existing one when dedupeKey collides).
 * Returns the persisted Issue including its assigned id.
 */
export function reportIssue(input: {
  severity: Issue['severity'];
  source: string;
  summary: string;
  detail?: string;
  fix?: Issue['fix'];
  dedupeKey?: string;
}): Issue {
  const next: Issue = {
    id: crypto.randomBytes(6).toString('hex'),
    ts: Date.now(),
    severity: input.severity,
    source: input.source,
    summary: input.summary,
    detail: input.detail,
    fix: input.fix,
    dedupeKey: input.dedupeKey,
  };

  if (!input.dedupeKey) {
    appendOne(next);
    return next;
  }

  // Dedupe path: rewrite file replacing any open match for the same key.
  const all = readAll();
  let replaced = false;
  const filtered = all.map((existing) => {
    if (existing.dedupeKey === input.dedupeKey && !existing.resolvedAt) {
      replaced = true;
      // Keep the previously assigned id so consumers' bookmarks survive.
      return { ...next, id: existing.id };
    }
    return existing;
  });
  if (!replaced) filtered.push(next);
  writeAll(filtered);
  return replaced ? filtered.find((i) => i.dedupeKey === input.dedupeKey)! : next;
}

/** Open (un-resolved) issues, newest first. */
export function listOpenIssues(): Issue[] {
  return readAll()
    .filter((i) => !i.resolvedAt)
    .sort((a, b) => b.ts - a.ts);
}

/** Every issue ever recorded, newest first. Includes resolved. */
export function listAllIssues(): Issue[] {
  return readAll().sort((a, b) => b.ts - a.ts);
}

/** Mark an issue resolved by id. Returns the resolved Issue or null. */
export function resolveIssue(id: string): Issue | null {
  const all = readAll();
  let found: Issue | null = null;
  const next = all.map((i) => {
    if (i.id !== id) return i;
    found = { ...i, resolvedAt: Date.now() };
    return found;
  });
  if (!found) return null;
  writeAll(next);
  return found;
}

/** Drop every resolved issue. Useful housekeeping; not user-facing. */
export function clearResolved(): number {
  const all = readAll();
  const remaining = all.filter((i) => !i.resolvedAt);
  const removed = all.length - remaining.length;
  writeAll(remaining);
  return removed;
}

// D19 — `clearAll` removed: Danger Zone reset doesn't actually wipe
// issues.jsonl (it's in the "shared infra preserved" list — see
// profile.ts:resetProfile). `clearResolved` covers the routine
// housekeeping case.
