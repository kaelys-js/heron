/** log-sink.test -- pure format/rotation/retention helpers PLUS the
 *  guarded I/O wrappers (writeToFile / mainLog / logBackendStderr /
 *  pruneCrashDumps).
 *
 *  WHY this matters: a packaged build has no terminal, so the file sink is
 *  the only place a main-process diagnostic survives a restart. Two
 *  properties make that sink trustworthy and are what these tests pin:
 *    - persistence shape: every entry is `<ISO ts> <LEVEL> <msg>` on ONE
 *      line, so a post-mortem can grep WARN/ERROR + parse by line. If the
 *      format drifts (level dropped, msg split across lines) the log
 *      becomes unparseable -- these assertions fail when that happens.
 *    - bounded growth: the sink rotates at the cap + drops backups past the
 *      retention window, or main.log grows without limit on a long-lived
 *      install. shouldRotate / isExpired own those boundaries; the boundary
 *      tests fail if the comparison flips (e.g. > vs >=).
 *  And one safety property: a logging failure (unwritable volume, console
 *  EPIPE) must NEVER throw out into the app -- the guarded-I/O tests pin
 *  that every fs/console call is swallowed. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPath: vi.fn((name: string) => `/fake/${name}`),
  statSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(() => []),
}));

vi.mock('electron', () => ({ app: { getPath: mocks.getPath } }));
vi.mock('node:fs', () => ({
  default: {
    statSync: mocks.statSync,
    appendFileSync: mocks.appendFileSync,
    mkdirSync: mocks.mkdirSync,
    existsSync: mocks.existsSync,
    renameSync: mocks.renameSync,
    unlinkSync: mocks.unlinkSync,
    readdirSync: mocks.readdirSync,
  },
}));

import {
  formatLine,
  shouldRotate,
  isExpired,
  writeToFile,
  mainLog,
  logBackendStderr,
  pruneCrashDumps,
  MAX_LOG_BYTES,
  MAX_LOG_AGE_DAYS,
  MAX_CRASH_DUMP_AGE_DAYS,
} from './log-sink';

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) so a mockImplementation set in one test
  // -- e.g. the "unwritable volume" test forcing mkdirSync to throw -- doesn't
  // leak into the next; then re-establish the benign defaults.
  vi.resetAllMocks();
  mocks.getPath.mockImplementation((name: string) => `/fake/${name}`);
  mocks.existsSync.mockReturnValue(false);
  mocks.readdirSync.mockReturnValue([]);
  mocks.mkdirSync.mockReturnValue(undefined as never);
  mocks.appendFileSync.mockReturnValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Pure helpers ──────────────────────────────────────────────────

describe('formatLine', () => {
  it('emits `<ISO ts> <LEVEL> <msg>` with an upper-cased level', () => {
    const ts = new Date('2026-06-01T12:34:56.000Z');
    // The level must be present + upper-cased so a reader can grep WARN /
    // ERROR out of a noisy file; the message must be preserved verbatim.
    expect(formatLine(ts, 'warn', 'boot check failed')).toBe(
      '2026-06-01T12:34:56.000Z WARN boot check failed',
    );
    expect(formatLine(ts, 'error', 'embedded server exited')).toBe(
      '2026-06-01T12:34:56.000Z ERROR embedded server exited',
    );
    expect(formatLine(ts, 'info', 'started')).toBe('2026-06-01T12:34:56.000Z INFO started');
  });

  it('flattens embedded newlines so each entry stays exactly one line', () => {
    // A multi-line message (e.g. a stack trace) must collapse to one line or
    // it breaks the one-entry-per-line invariant the tail/parse relies on --
    // a reader would otherwise mistake trace lines for new entries.
    const ts = new Date('2026-06-01T00:00:00.000Z');
    const out = formatLine(ts, 'error', 'line one\nline two\r\nline three');
    expect(out).toBe('2026-06-01T00:00:00.000Z ERROR line one line two line three');
    expect(out.includes('\n')).toBe(false);
  });
});

describe('shouldRotate', () => {
  it('rotates at exactly the cap, not just over it', () => {
    // Rotation fires BEFORE the append that would push the file past the cap,
    // so the trigger is at-or-over (>=). At exactly the cap we must rotate;
    // one byte under we must not.
    expect(shouldRotate(MAX_LOG_BYTES, MAX_LOG_BYTES)).toBe(true);
    expect(shouldRotate(MAX_LOG_BYTES + 1, MAX_LOG_BYTES)).toBe(true);
    expect(shouldRotate(MAX_LOG_BYTES - 1, MAX_LOG_BYTES)).toBe(false);
    expect(shouldRotate(0, MAX_LOG_BYTES)).toBe(false);
  });
});

describe('isExpired', () => {
  it('treats exactly maxAgeDays old as expired (inclusive boundary)', () => {
    // A file pinned at the retention edge must be pruned, not kept one extra
    // cycle -- otherwise "14 days" silently means "15+". The boundary is
    // therefore inclusive (>=).
    const now = Date.now();
    const exactlyOld = now - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
    expect(isExpired(exactlyOld, now, MAX_LOG_AGE_DAYS)).toBe(true);

    // One millisecond younger than the window is still alive.
    expect(isExpired(exactlyOld + 1, now, MAX_LOG_AGE_DAYS)).toBe(false);

    // A file written "now" is never expired.
    expect(isExpired(now, now, MAX_LOG_AGE_DAYS)).toBe(false);
  });

  it('reports older-than-window files as expired', () => {
    const now = Date.now();
    const twoWeeksOne = now - (MAX_LOG_AGE_DAYS + 1) * 24 * 60 * 60 * 1000;
    expect(isExpired(twoWeeksOne, now, MAX_LOG_AGE_DAYS)).toBe(true);
  });
});

// ── Guarded I/O wrappers ──────────────────────────────────────────

describe('writeToFile', () => {
  it('appends a formatted line under app.getPath(logs)/main.log', () => {
    // The whole point of the sink: the entry lands in a file (persists past
    // a restart), at the OS logs path, in the parseable one-line format.
    writeToFile('warn', 'boot check failed');
    expect(mocks.getPath).toHaveBeenCalledWith('logs');
    expect(mocks.appendFileSync).toHaveBeenCalledTimes(1);
    const [file, payload] = mocks.appendFileSync.mock.calls[0];
    expect(file).toBe('/fake/logs/main.log');
    expect(payload).toMatch(/ WARN boot check failed\n$/);
  });

  it('rotates BEFORE appending once the live file is at the cap', () => {
    // Bounded growth: at the cap we must rename main.log -> main.log.1 first,
    // so the live file is reset rather than growing past the cap forever.
    mocks.statSync.mockReturnValue({ size: MAX_LOG_BYTES } as never);
    mocks.existsSync.mockReturnValue(true);
    writeToFile('error', 'overflow');
    expect(mocks.renameSync).toHaveBeenCalledWith('/fake/logs/main.log', '/fake/logs/main.log.1');
    expect(mocks.appendFileSync).toHaveBeenCalledTimes(1);
  });

  it('prunes a rotated backup past the retention window during rotate', () => {
    // Old backups must be unlinked or disk usage is unbounded across rotations.
    mocks.statSync.mockImplementation((p: string) => {
      if (p === '/fake/logs/main.log') return { size: MAX_LOG_BYTES } as never;
      // The backup is well past the window.
      return { mtimeMs: Date.now() - (MAX_LOG_AGE_DAYS + 5) * 24 * 60 * 60 * 1000 } as never;
    });
    mocks.existsSync.mockReturnValue(true);
    writeToFile('warn', 'rotate me');
    expect(mocks.unlinkSync).toHaveBeenCalled();
  });

  it('never throws when the volume is unwritable (sink failure is silent)', () => {
    // A logging failure must NOT take down the app -- the fs throw is swallowed.
    mocks.mkdirSync.mockImplementation(() => {
      throw new Error('EROFS');
    });
    expect(() => writeToFile('error', 'cannot write')).not.toThrow();
  });

  it('no-ops when the logs path cannot resolve (app not ready)', () => {
    // Lazy app.getPath: if called before whenReady / with electron stubbed,
    // it throws -- the sink must quietly do nothing, not crash the importer.
    mocks.getPath.mockImplementation(() => {
      throw new Error('app not ready');
    });
    expect(() => writeToFile('info', 'too early')).not.toThrow();
    expect(mocks.appendFileSync).not.toHaveBeenCalled();
  });
});

describe('mainLog', () => {
  it('writes to the file AND echoes to console (dev keeps live output)', () => {
    // Dev still sees output live; prod still has the durable file copy. Both
    // paths fire -- losing the terminal must not lose the persisted record.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mainLog('warn', 'hello');
    expect(mocks.appendFileSync).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('hello');
  });

  it('routes each level to the matching console method', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mainLog('info', 'i');
    mainLog('error', 'e');
    expect(log).toHaveBeenCalledWith('i');
    expect(error).toHaveBeenCalledWith('e');
  });

  it('survives a console that throws (EPIPE from an intercepted console)', () => {
    // A wrapping debugger's console can EPIPE; that must not crash main, and
    // the file write must still have happened.
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('EPIPE');
    });
    expect(() => mainLog('error', 'boom')).not.toThrow();
    expect(mocks.appendFileSync).toHaveBeenCalledTimes(1);
  });
});

describe('logBackendStderr', () => {
  it('writes the line to the sink under a [backend] prefix', () => {
    // The embedded server's stderr is otherwise lost in a packaged build; the
    // [backend] prefix marks its provenance in the shared main.log.
    logBackendStderr('TypeError: boom');
    const [, payload] = mocks.appendFileSync.mock.calls[0];
    expect(payload).toMatch(/ WARN \[backend\] TypeError: boom\n$/);
  });

  it('echoes to parent stderr in dev only', () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    logBackendStderr('dev line', { isDev: true });
    expect(write).toHaveBeenCalledWith('dev line\n');

    write.mockClear();
    logBackendStderr('prod line', { isDev: false });
    expect(write).not.toHaveBeenCalled();
  });

  it('survives a closed parent stderr in dev', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => {
      throw new Error('EPIPE');
    });
    expect(() => logBackendStderr('x', { isDev: true })).not.toThrow();
  });
});

describe('pruneCrashDumps', () => {
  it('unlinks minidumps older than the retention window, keeps fresh ones', () => {
    // Crashpad never prunes its own dir, so without this the dir grows forever.
    const now = Date.now();
    mocks.readdirSync.mockReturnValue(['old.dmp', 'fresh.dmp'] as never);
    mocks.statSync.mockImplementation(
      (p: string) =>
        ({
          isFile: () => true,
          mtimeMs: p.endsWith('old.dmp')
            ? now - (MAX_CRASH_DUMP_AGE_DAYS + 1) * 24 * 60 * 60 * 1000
            : now,
        }) as never,
    );
    pruneCrashDumps(now);
    expect(mocks.getPath).toHaveBeenCalledWith('crashDumps');
    expect(mocks.unlinkSync).toHaveBeenCalledTimes(1);
    expect(mocks.unlinkSync).toHaveBeenCalledWith('/fake/crashDumps/old.dmp');
  });

  it('skips subdirectories (only files are dumps)', () => {
    const now = Date.now();
    mocks.readdirSync.mockReturnValue(['subdir'] as never);
    mocks.statSync.mockReturnValue({
      isFile: () => false,
      mtimeMs: now - (MAX_CRASH_DUMP_AGE_DAYS + 10) * 24 * 60 * 60 * 1000,
    } as never);
    pruneCrashDumps(now);
    expect(mocks.unlinkSync).not.toHaveBeenCalled();
  });

  it('no-ops when the crashDumps dir does not exist', () => {
    mocks.readdirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(() => pruneCrashDumps()).not.toThrow();
    expect(mocks.unlinkSync).not.toHaveBeenCalled();
  });

  it('no-ops when the crashDumps path cannot resolve (app not ready)', () => {
    mocks.getPath.mockImplementation(() => {
      throw new Error('app not ready');
    });
    expect(() => pruneCrashDumps()).not.toThrow();
    expect(mocks.readdirSync).not.toHaveBeenCalled();
  });

  it('skips a single unstatable dump without aborting the prune', () => {
    const now = Date.now();
    mocks.readdirSync.mockReturnValue(['locked.dmp', 'old.dmp'] as never);
    mocks.statSync.mockImplementation((p: string) => {
      if (p.endsWith('locked.dmp')) throw new Error('EACCES');
      return {
        isFile: () => true,
        mtimeMs: now - (MAX_CRASH_DUMP_AGE_DAYS + 1) * 86_400_000,
      } as never;
    });
    pruneCrashDumps(now);
    // The locked one is skipped; the genuinely-old one is still pruned.
    expect(mocks.unlinkSync).toHaveBeenCalledWith('/fake/crashDumps/old.dmp');
  });
});
