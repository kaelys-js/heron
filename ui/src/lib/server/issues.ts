/** Issue stream -- append-only persistent queue of open problems
 *  needing user attention. Distinct from the activity feed: issues
 *  live in data/issues.jsonl and stay visible until resolved.
 *  Multi-user: every issue tagged with user_id from user-context.ts;
 *  listOpenIssues()/listAllIssues() filter to that user. System-wide
 *  issues (no userId) are visible to every authenticated user.
 *  dedupeKey contract: when a job re-detects the same problem class,
 *  it passes a stable key; the file is rewritten in place so the
 *  open list shows ONE row per key. Dedup is per-user. */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, DATA_ROOT } from './files';
import type { Issue } from '$lib/types';
import { maybeCurrentUserId, SYSTEM_USER_ID } from './user-context';

const ISSUES_PATH = path.join(DATA_ROOT, 'issues.jsonl');

function ensureDir() {
  try {
    fs.mkdirSync(path.dirname(ISSUES_PATH), { recursive: true });
  } catch {
    // mkdir recursive only fails for permission / IO issues -- write
    // attempts below will surface those concretely with the real op name.
  }
}

function readAll(): Issue[] {
  try {
    if (!fs.existsSync(ISSUES_PATH)) {
      return [];
    }
    const txt = fs.readFileSync(ISSUES_PATH, 'utf8');
    const out: Issue[] = [];
    for (const line of txt.split('\n')) {
      if (!line.trim()) {
        continue;
      }
      try {
        const ev = JSON.parse(line) as Issue;
        if (ev.id && ev.ts) {
          out.push(ev);
        }
      } catch {
        // Truncated JSON line (crash mid-write) -- drop and keep loading.
        // Re-entering logEvent from issues.ts could loop if log+issue
        // both write at the same time, so we skip silently.
      }
    }
    return out;
  } catch (e) {
    // File read failed -- return empty rather than throwing so callers
    // (UI badges, /api/issues) degrade gracefully. Mirror to console
    // since logEvent would also try to read this file.
    // eslint-disable-next-line no-console
    console.error('[issues] readAll failed:', e instanceof Error ? e.message : String(e));
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
  fs.appendFileSync(ISSUES_PATH, `${JSON.stringify(issue)}\n`);
}

function visibleToUser(issue: Issue, userId: string): boolean {
  if (!issue.userId) {
    return true;
  } // system-wide → everyone sees
  if (issue.userId === SYSTEM_USER_ID) {
    return true;
  }
  return issue.userId === userId;
}

/**
 * Report a new issue (or refresh an existing one when dedupeKey collides).
 * Returns the persisted Issue including its assigned id.
 *
 * `userId` defaults to the AsyncLocalStorage context. Pass `null` to emit
 * a system-wide issue visible to every authenticated user.
 */
export function reportIssue(input: {
  severity: Issue['severity'];
  source: string;
  summary: string;
  detail?: string;
  fix?: Issue['fix'];
  dedupeKey?: string;
  userId?: string | null;
}): Issue {
  const resolvedUserId =
    input.userId === null ? undefined : (input.userId ?? maybeCurrentUserId() ?? undefined);
  const userIdTag =
    resolvedUserId && resolvedUserId !== SYSTEM_USER_ID ? resolvedUserId : undefined;
  const next: Issue = {
    id: crypto.randomBytes(6).toString('hex'),
    ts: Date.now(),
    severity: input.severity,
    source: input.source,
    summary: input.summary,
    detail: input.detail,
    fix: input.fix,
    dedupeKey: input.dedupeKey,
    userId: userIdTag,
  };

  let persisted: Issue;

  if (!input.dedupeKey) {
    appendOne(next);
    // Mirror to app.db.issues for indexed per-user queries.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { dbWriteIssue } = require('./db-writers') as typeof import('./db-writers');
      dbWriteIssue(next);
    } catch (e) {
      // app.db mirror failed -- JSONL is still the source of truth so
      // listOpenIssues() still works. Surface via console so the operator
      // notices index drift, but don't call reportServerError (that would
      // attempt a fresh issue write and could recurse).
      // eslint-disable-next-line no-console
      console.error(
        '[issues] dbWriteIssue mirror failed:',
        e instanceof Error ? e.message : String(e),
      );
    }
    persisted = next;
  } else {
    // Dedupe path: rewrite file replacing any open match for the same key
    // AND the same userId scope (system-wide and per-user dedupe keys are
    // distinct, e.g. two users can each have an "apply:job-123" issue).
    const all = readAll();
    let replaced = false;
    const filtered = all.map((existing) => {
      if (
        existing.dedupeKey === input.dedupeKey &&
        existing.userId === userIdTag &&
        !existing.resolvedAt
      ) {
        replaced = true;
        return { ...next, id: existing.id };
      }
      return existing;
    });
    if (!replaced) {
      filtered.push(next);
    }
    writeAll(filtered);
    persisted = replaced
      ? filtered.find((i) => i.dedupeKey === input.dedupeKey && i.userId === userIdTag)!
      : next;
    // Mirror the dedup'd row into app.db.issues.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { dbWriteIssue } = require('./db-writers') as typeof import('./db-writers');
      dbWriteIssue(persisted);
    } catch {
      /* non-fatal */
    }
  }

  // A persisted Issue is a PRODUCT-kind problem the user must act on, so emit
  // one bus event after the durable write -- that pings the bell over the SSE
  // stream (the activity feed shows it; the bell badge ticks). Lazy DYNAMIC
  // import keeps events.ts <-> issues.ts free of a static import cycle; it's
  // fire-and-forget so the issue write (and this function's synchronous Issue
  // return) never waits on the bell, and a missing/failing events module can
  // never block persistence.
  const userScope = input.userId === null ? null : (persisted.userId ?? undefined);
  void import('./events')
    .then(({ logEvent }) => {
      logEvent(persisted.source, persisted.summary, {
        level: persisted.severity,
        category: 'application',
        kind: 'product',
        message: persisted.detail,
        // Carry the same user scope so the SSE per-user filter shows it to the
        // right person (and system-wide issues stay broadcast).
        userId: userScope,
      });
    })
    .catch(() => {
      /* bus emit best-effort -- the issue is already persisted */
    });

  return persisted;
}

/** Open (un-resolved) issues for the current user, newest first. Includes
 *  system-wide issues (those with no userId). */
export function listOpenIssues(): Issue[] {
  const userId = maybeCurrentUserId() ?? SYSTEM_USER_ID;
  return readAll()
    .filter((i) => !i.resolvedAt && visibleToUser(i, userId))
    .sort((a, b) => b.ts - a.ts);
}

/** Every issue ever recorded for the current user, newest first. Includes
 *  resolved ones (audit trail). */
export function listAllIssues(): Issue[] {
  const userId = maybeCurrentUserId() ?? SYSTEM_USER_ID;
  return readAll()
    .filter((i) => visibleToUser(i, userId))
    .sort((a, b) => b.ts - a.ts);
}

/** Mark an issue resolved by id. Returns the resolved Issue or null.
 *  Only resolves issues this user can see -- prevents one user resolving
 *  another user's issues. */
export function resolveIssue(id: string): Issue | null {
  const userId = maybeCurrentUserId() ?? SYSTEM_USER_ID;
  const all = readAll();
  let found: Issue | null = null;
  const next = all.map((i) => {
    if (i.id !== id) {
      return i;
    }
    if (!visibleToUser(i, userId)) {
      return i;
    } // pretend it doesn't exist
    found = { ...i, resolvedAt: Date.now() };
    return found;
  });
  if (!found) {
    return null;
  }
  writeAll(next);
  // Mirror resolution into app.db.issues.
  try {
    const f = found as Issue;
    if (f.userId) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { dbResolveIssue } = require('./db-writers') as typeof import('./db-writers');
      dbResolveIssue(f.userId, f.id, f.resolvedAt ?? Date.now());
    }
  } catch (e) {
    // app.db mirror failed -- JSONL is still authoritative.
    // eslint-disable-next-line no-console
    console.error(
      '[issues] dbResolveIssue mirror failed:',
      e instanceof Error ? e.message : String(e),
    );
  }
  return found;
}

/** Drop every resolved issue visible to the current user. */
export function clearResolved(): number {
  const userId = maybeCurrentUserId() ?? SYSTEM_USER_ID;
  const all = readAll();
  const remaining = all.filter((i) => !i.resolvedAt || !visibleToUser(i, userId));
  const removed = all.length - remaining.length;
  writeAll(remaining);
  return removed;
}
