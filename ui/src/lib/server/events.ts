import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ActivityEvent, EventLevel, EventCategory } from '$lib/types';
import { ROOT, DATA_ROOT } from './files';
import { maybeCurrentUserId, SYSTEM_USER_ID } from './user-context';

const LOG_FILE = path.join(DATA_ROOT, 'activity.jsonl');
const LOG_BACKUP = LOG_FILE + '.1';
const MAX_BUFFER = 500;
/** Rotate the activity log when it exceeds this size on append.
 *  Keeps one backup (`activity.jsonl.1`) so total disk usage is bounded
 *  at ~2× this number. Set conservatively -- we don't read the whole log
 *  at boot, only the tail, so size has no practical upside. */
const MAX_LOG_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * `safeConsole` is the *only* console pathway used inside this module.
 * If a wrapping debugger / extension intercepts console and that pathway
 * fails (e.g. Cursor's wallaby/console-ninja closing its socket → EPIPE),
 * the error is swallowed instead of propagating up to the runtime's
 * `uncaughtException` handler -- which would re-enter logEvent and cause
 * an unbounded feedback loop. See data/activity.jsonl growing to 15GB
 * for what happens without this guard.
 */
function safeConsole(level: 'log' | 'error', ...args: unknown[]): void {
  try {
    if (level === 'error') console.error(...args);
    else console.log(...args);
  } catch {
    // Intentionally empty -- we cannot do anything useful if console itself
    // is throwing, and any logEvent call from here would re-enter.
  }
}

class Bus extends EventEmitter {
  private buf: ActivityEvent[] = [];
  /** Reentrancy guard. If a listener of the 'event' channel itself emits
   *  events (via logEvent → emitEvent), we cap the recursion depth so a
   *  pathological listener can't melt the disk. Lossy by design. */
  private depth = 0;
  /** Most recent rapid-fire window: { ts (ms), count }. Resets every 1s.
   *  If we cross BURST_LIMIT in one window we drop further events for the
   *  remainder of the window -- belt-and-braces against any future loop. */
  private windowStart = 0;
  private windowCount = 0;
  private droppedThisWindow = 0;

  constructor() {
    super();
    this.setMaxListeners(50); // dev HMR can stack listeners -- avoid noise warning
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      // Open first, then fstat the open fd. This is the
      // CodeQL `js/file-system-race`-clean replacement for
      // `existsSync -> statSync -> openSync`: ENOENT at openSync
      // means "file gone since startup" (return early), and the
      // size read from fstat is bound to the same fd we read from.
      let fd: number;
      try {
        fd = fs.openSync(LOG_FILE, 'r');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw e;
      }
      let txt: string;
      try {
        const stat = fs.fstatSync(fd);
        const size = stat.size;
        const TAIL_BYTES = 256 * 1024; // 256KB tail is more than 500 events worth
        if (size > TAIL_BYTES) {
          const buf = Buffer.alloc(TAIL_BYTES);
          fs.readSync(fd, buf, 0, TAIL_BYTES, size - TAIL_BYTES);
          txt = buf.toString('utf8');
          // Drop the first (probably partial) line
          const nl = txt.indexOf('\n');
          if (nl >= 0) txt = txt.slice(nl + 1);
        } else {
          const buf = Buffer.alloc(size);
          fs.readSync(fd, buf, 0, size, 0);
          txt = buf.toString('utf8');
        }
      } finally {
        fs.closeSync(fd);
      }
      const lines = txt.trim().split('\n').slice(-MAX_BUFFER);
      for (const line of lines) {
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.id && ev.ts) this.buf.push(ev);
        } catch {
          // Truncated final line from a crash mid-write -- skip and continue
          // loading the rest of the buffer. Logging here would re-enter
          // the load path, so we drop silently by design.
        }
      }
    } catch (e) {
      safeConsole('error', '[events] failed to load', e);
    }
  }

  private rotateIfNeeded(): void {
    try {
      // Race-free size check: stat directly; ENOENT means no log yet.
      // CodeQL flagged the previous `existsSync -> statSync` form as
      // `js/file-system-race`.
      let size: number;
      try {
        size = fs.statSync(LOG_FILE).size;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw e;
      }
      if (size <= MAX_LOG_BYTES) return;
      // Move the current log out of the way; the next append re-creates it.
      // Replace any existing .1 (we keep only one backup to bound disk use).
      try {
        fs.unlinkSync(LOG_BACKUP);
      } catch {
        // Old backup unlink failed (EBUSY / EACCES / ENOENT). Rotation is
        // best-effort -- the rename below will fail too in real-failure
        // cases and the outer catch will surface it. Race-free vs the
        // previous `if (existsSync) unlink` form.
      }
      try {
        fs.renameSync(LOG_FILE, LOG_BACKUP);
      } catch {
        // Rename failed. Outer catch logs nothing because re-entering
        // logEvent from inside rotation would loop forever.
      }
      // Drop a rotation breadcrumb without going through logEvent (avoid
      // recursion if rotation fails repeatedly).
      try {
        fs.writeFileSync(
          LOG_FILE,
          JSON.stringify({
            id: crypto.randomBytes(6).toString('hex'),
            ts: Date.now(),
            level: 'info',
            category: 'system',
            source: 'events',
            title: 'Activity log rotated',
            message:
              'previous file moved to activity.jsonl.1 (' + Math.round(size / 1024 / 1024) + 'MB)',
          }) + '\n',
        );
      } catch {
        // Rotation breadcrumb write failed -- the next regular append
        // will recreate LOG_FILE. We can't re-enter logEvent from here.
      }
    } catch {
      // Rotation is best-effort -- never let it crash the caller, and
      // never re-enter logEvent from rotation code.
    }
  }

  private appendToDisk(ev: ActivityEvent) {
    try {
      fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
      this.rotateIfNeeded();
      fs.appendFileSync(LOG_FILE, JSON.stringify(ev) + '\n');
    } catch (e) {
      safeConsole('error', '[events] failed to persist', e);
    }
  }

  emitEvent(ev: ActivityEvent) {
    // ---- recursion + burst guards ----
    if (this.depth > 8) return; // stop runaway recursion at ~depth 8
    const now = Date.now();
    const BURST_WINDOW = 1000;
    const BURST_LIMIT = 200; // events per second across the whole bus
    if (now - this.windowStart > BURST_WINDOW) {
      // Window rolled over -- if we dropped anything, surface it once.
      if (this.droppedThisWindow > 0) {
        const note: ActivityEvent = {
          id: crypto.randomBytes(6).toString('hex'),
          ts: now,
          level: 'warn',
          category: 'system',
          source: 'events',
          title: 'Bus rate-limited',
          message: 'Dropped ' + this.droppedThisWindow + ' events in the last second.',
        };
        this.droppedThisWindow = 0;
        this.windowStart = now;
        this.windowCount = 1;
        this.buf.push(note);
        if (this.buf.length > MAX_BUFFER) this.buf.shift();
        this.appendToDisk(note);
        this.depth++;
        try {
          this.emit('event', note);
        } finally {
          this.depth--;
        }
      } else {
        this.windowStart = now;
        this.windowCount = 0;
      }
    }
    this.windowCount++;
    if (this.windowCount > BURST_LIMIT) {
      this.droppedThisWindow++;
      return; // silently drop
    }

    this.buf.push(ev);
    if (this.buf.length > MAX_BUFFER) this.buf.shift();
    this.appendToDisk(ev);
    // Mirror to app.db.activity_events for indexed per-user queries. The
    // JSONL stays the source of truth (cheap append, easy tail-tailing);
    // the DB row enables future "show me my last 100 errors of source=X"
    // queries without re-parsing megabytes of JSONL.
    //
    // Lazy-require so a missing better-sqlite3 binary at boot doesn't
    // crash the event bus -- events.ts MUST stay up even when the DB is
    // broken because we use it to log DB errors.
    if (ev.userId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { dbWriteActivity } = require('./db-writers') as typeof import('./db-writers');
        dbWriteActivity(ev);
      } catch {
        /* non-fatal */
      }
    }
    this.depth++;
    try {
      this.emit('event', ev);
    } finally {
      this.depth--;
    }
  }

  recent(): ActivityEvent[] {
    return [...this.buf];
  }

  /** Per-user feed: returns events tagged for this user PLUS broadcast events
   *  (those with no userId). Used by /api/stream and the dashboard's
   *  activity feed so users don't see each other's task output. */
  recentForUser(userId: string): ActivityEvent[] {
    return this.buf.filter(
      (ev) => !ev.userId || ev.userId === userId || ev.userId === SYSTEM_USER_ID,
    );
  }

  clear() {
    this.buf = [];
    try {
      fs.writeFileSync(LOG_FILE, '');
    } catch (e) {
      // Use safeConsole here; logEvent would re-emit and re-fail.
      // The buffer was cleared in-memory regardless, so the UI sees a
      // cleared feed; only on-disk persistence is impacted.
      safeConsole('error', '[events] failed to clear log file:', e);
    }
  }
}

export const bus = new Bus();

/**
 * Install a named bus listener -- idempotent across Vite HMR reloads.
 *
 * Without this helper, every save of a module that does `bus.on('event', …)`
 * at module init stacks a fresh listener on top of the previous one. After
 * ~50 dev saves every event fires through 50 listener callbacks; if any
 * listener emits its own events that's a 50× amplifier on log volume.
 *
 * The trick: stamp the handler with a `__busName` tag so we can find any
 * prior listener with the same name (regardless of whether the calling
 * module's local state survived the reload) and remove it before adding
 * the new one. EventEmitter doesn't index by name natively, so we walk
 * the existing listener list -- that's O(N) in current listener count,
 * not O(1). Called once per module load (~10 listeners at runtime) so
 * even with HMR amplification it remains fast enough; a true O(1) lookup
 * would need a separate Map<name, handler> mirror, deliberately not done
 * because it doubles the bookkeeping.
 */
export function installBusListener(name: string, handler: (ev: ActivityEvent) => void): void {
  for (const h of bus.listeners('event')) {
    if ((h as { __busName?: string }).__busName === name) {
      bus.off('event', h as (ev: ActivityEvent) => void);
    }
  }
  (handler as { __busName?: string }).__busName = name;
  bus.on('event', handler);
}

// D22 -- `removeBusListener` removed: only `stopScheduler` called it, and
// that itself is dead (D17). `installBusListener` is idempotent across
// HMR via the __busName tag walk, so explicit removal isn't needed.

export function logEvent(
  source: string,
  title: string,
  opts: {
    level?: EventLevel;
    category?: EventCategory;
    message?: string;
    link?: string;
    stack?: string;
    /** Profile slug if the event is per-profile (scan in profile X, evaluate
     *  for a job in profile Y, etc.). Omit for shared-infra events. */
    profileId?: string;
    /** Override user-id tagging -- caller knows whose event this is. When
     *  omitted, defaults to the AsyncLocalStorage current user (per
     *  request) or SYSTEM_USER_ID outside a request. Pass `null` to
     *  emit a broadcast event visible to every authenticated user. */
    userId?: string | null;
  } = {},
): ActivityEvent {
  const resolvedUserId =
    opts.userId === null
      ? undefined // broadcast -- no userId tag
      : (opts.userId ?? maybeCurrentUserId() ?? undefined);
  const ev: ActivityEvent = {
    id: crypto.randomBytes(6).toString('hex'),
    ts: Date.now(),
    level: opts.level ?? 'info',
    category: opts.category ?? 'system',
    source,
    title,
    message: opts.message,
    link: opts.link,
    stack: opts.stack,
    profileId: opts.profileId,
    userId: resolvedUserId && resolvedUserId !== SYSTEM_USER_ID ? resolvedUserId : undefined,
  };
  bus.emitEvent(ev);
  const prefix =
    ev.level === 'error' ? '✗' : ev.level === 'warn' ? '⚠' : ev.level === 'success' ? '✓' : 'ℹ';
  const head = prefix + ' [' + source + '] ' + title + (opts.message ? ' — ' + opts.message : '');
  // safeConsole swallows EPIPE/EBADF from intercepted-console extensions --
  // see comment at the top of this file.
  if (ev.level === 'error') {
    safeConsole('error', head);
    if (opts.stack) safeConsole('error', opts.stack);
  } else {
    safeConsole('log', head);
  }
  return ev;
}

/**
 * Single shared server-side error reporter. Always logs the full error to stdout/stderr
 * with stack trace, AND emits an event so the client UI (toast + activity feed) sees it.
 * Use from hooks.server.ts, api wrap(), spawned-process handlers, etc.
 */
export function reportServerError(
  source: string,
  title: string,
  err: unknown,
  opts: {
    category?: EventCategory;
    link?: string;
    profileId?: string;
    userId?: string | null;
  } = {},
): ActivityEvent {
  const isError = err instanceof Error;
  const message = isError
    ? err.message
    : typeof err === 'string'
      ? err
      : (() => {
          try {
            return JSON.stringify(err);
          } catch {
            return String(err);
          }
        })();
  const stack = isError && err.stack ? err.stack.slice(0, 2000) : undefined;
  return logEvent(source, title, {
    level: 'error',
    category: opts.category ?? 'system',
    message,
    link: opts.link,
    stack,
    profileId: opts.profileId,
    userId: opts.userId,
  });
}
