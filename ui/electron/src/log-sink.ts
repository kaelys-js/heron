/** Persistent, structured log sink for the Electron MAIN process.
 *
 *  A packaged build has no attached terminal, so console.warn/error are
 *  lost the moment the app restarts -- a crash or an updater failure that
 *  only printed to stdout leaves nothing to diagnose afterward. This sink
 *  appends every main-process diagnostic to a file under
 *  app.getPath('logs')/main.log, one line per entry, so the record
 *  survives a restart and stays available for a post-mortem.
 *
 *  Bounded growth: the file rotates to main.log.1 once it exceeds a size
 *  cap (kept to a small number of backups) and rotated files older than a
 *  retention window are pruned, so the sink never grows without limit.
 *
 *  Pure helpers (formatLine / shouldRotate / isExpired) hold the format +
 *  rotation + retention decisions and are unit-tested WITHOUT electron or
 *  fs. The thin write/rotate/prune I/O wraps them and guards every fs call
 *  in try/catch -- a logging failure must NEVER crash the app (mirrors the
 *  safeConsole posture in lib/server/events.ts). app.getPath is resolved
 *  lazily so importing the module doesn't require an initialized app. */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

/** Rotate main.log once it passes this size. Keeps the file small enough
 *  to open + tail by hand without reading megabytes. */
export const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB
/** How many rotated backups to keep (main.log.1, main.log.2). Total disk
 *  usage is bounded at roughly (BACKUPS + 1) x MAX_LOG_BYTES. */
export const MAX_BACKUPS = 2;
/** Rotated logs older than this are pruned on the next rotate. */
export const MAX_LOG_AGE_DAYS = 14;
/** Crash minidumps older than this are pruned on boot. Crashpad never
 *  prunes its own dir, so without this minidumps accumulate forever. */
export const MAX_CRASH_DUMP_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Format one log entry: `<ISO ts> <LEVEL> <msg>`. The ISO timestamp
 *  sorts lexically + is timezone-unambiguous; the upper-cased level lets a
 *  reader grep for WARN/ERROR. Newlines in msg are flattened to keep the
 *  one-line-per-entry invariant the tail/parse relies on. */
export function formatLine(ts: Date, level: LogLevel, msg: string): string {
  const flat = msg.replace(/\r?\n/g, ' ');
  return `${ts.toISOString()} ${level.toUpperCase()} ${flat}`;
}

/** True once the live log has reached the cap, so the caller rotates
 *  BEFORE the next append rather than after -- bounding the file at the
 *  cap rather than letting a final write overshoot it. */
export function shouldRotate(sizeBytes: number, cap: number): boolean {
  return sizeBytes >= cap;
}

/** True when a file's mtime is at or beyond maxAgeDays old. The boundary
 *  is inclusive (exactly maxAgeDays old is expired) so a file pinned at
 *  the retention edge is pruned rather than kept one extra cycle. */
export function isExpired(mtimeMs: number, now: number, maxAgeDays: number): boolean {
  return now - mtimeMs >= maxAgeDays * DAY_MS;
}

/** Resolve the log file path lazily. app.getPath('logs') throws before the
 *  app is ready / when electron is stubbed in tests, so this is only
 *  called from the I/O wrappers (never at import time). */
function logFilePath(): string {
  return path.join(app.getPath('logs'), 'main.log');
}

/** Rotate main.log -> main.log.1 -> main.log.2, dropping the oldest, then
 *  prune any rotated backup past the retention window. Best-effort: every
 *  fs call is guarded so a rotate failure leaves the live log writable. */
function rotate(file: string): void {
  // Shift backups down: main.log.(N-1) -> main.log.N, oldest first so we
  // never clobber a backup we still need to move.
  for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
    const from = `${file}.${i}`;
    const to = `${file}.${i + 1}`;
    try {
      if (fs.existsSync(from)) {
        fs.renameSync(from, to);
      }
    } catch {
      /* a single backup we couldn't move isn't worth aborting the rotate */
    }
  }
  try {
    if (fs.existsSync(file)) {
      fs.renameSync(file, `${file}.1`);
    }
  } catch {
    /* live log couldn't be rotated -- it stays + keeps growing past cap,
       which beats losing the ability to log at all */
  }
  pruneExpiredBackups(file);
}

/** Drop rotated backups (main.log.1, main.log.2, the dropped main.log.3)
 *  older than the retention window. Guarded per-file. */
function pruneExpiredBackups(file: string): void {
  const now = Date.now();
  for (let i = 1; i <= MAX_BACKUPS + 1; i++) {
    const backup = `${file}.${i}`;
    try {
      if (!fs.existsSync(backup)) {
        continue;
      }
      const { mtimeMs } = fs.statSync(backup);
      if (isExpired(mtimeMs, now, MAX_LOG_AGE_DAYS)) {
        fs.unlinkSync(backup);
      }
    } catch {
      /* best-effort prune -- skip this backup */
    }
  }
}

/** Append one entry to main.log, rotating first if the live file is at the
 *  cap. All fs is guarded: if the sink can't write (read-only volume, perms)
 *  the app keeps running -- losing a log line must never crash the process. */
export function writeToFile(level: LogLevel, msg: string): void {
  let file: string;
  try {
    file = logFilePath();
  } catch {
    return; // app not ready / electron stubbed -- nothing to write to
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      const { size } = fs.statSync(file);
      if (shouldRotate(size, MAX_LOG_BYTES)) {
        rotate(file);
      }
    } catch {
      /* file doesn't exist yet (first write) or stat failed -- skip rotate */
    }
    fs.appendFileSync(file, `${formatLine(new Date(), level, msg)}\n`);
  } catch {
    /* sink unwritable -- swallow so logging never takes down the app */
  }
}

/** Single console toggle so an EPIPE from a wrapping debugger's intercepted
 *  console (see events.ts safeConsole) can't crash the main process. */
function safeConsole(level: LogLevel, msg: string): void {
  try {
    if (level === 'error') {
      console.error(msg);
    } else if (level === 'warn') {
      console.warn(msg);
    } else {
      console.log(msg);
    }
  } catch {
    /* console itself is throwing -- nothing useful to do */
  }
}

/** The main-process logging entry point: ALWAYS persist to the file sink,
 *  and ALSO echo to the console so a dev run still sees output live. Both
 *  paths are independently guarded -- one failing never blocks the other. */
export function mainLog(level: LogLevel, msg: string): void {
  writeToFile(level, msg);
  safeConsole(level, msg);
}

/** Forward one captured backend stderr line into the sink under a [backend]
 *  prefix, and echo it to the parent's stderr in dev so the live terminal
 *  experience matches the prior stdio:'inherit'. The embedded server is
 *  spawned with stderr piped (server-process.ts) so this is the line's
 *  landing point; in a packaged build the file sink is the only place it
 *  survives. */
export function logBackendStderr(line: string, opts: { isDev: boolean } = { isDev: false }): void {
  writeToFile('warn', `[backend] ${line}`);
  if (opts.isDev) {
    try {
      process.stderr.write(`${line}\n`);
    } catch {
      /* parent stderr gone -- the file sink already has the line */
    }
  }
}

/** Prune crash minidumps older than the retention window. Crashpad writes
 *  to app.getPath('crashDumps') and never prunes, so this is the only thing
 *  bounding that dir. Best-effort + fully guarded: a missing dir or an
 *  unreadable file is skipped, never thrown. */
export function pruneCrashDumps(now: number = Date.now()): void {
  let dir: string;
  try {
    dir = app.getPath('crashDumps');
  } catch {
    return; // app not ready / electron stubbed
  }
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return; // no crash-dumps dir yet -- nothing to prune
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    try {
      const st = fs.statSync(full);
      if (st.isFile() && isExpired(st.mtimeMs, now, MAX_CRASH_DUMP_AGE_DAYS)) {
        fs.unlinkSync(full);
      }
    } catch {
      /* skip a single unstatable / locked dump */
    }
  }
}
