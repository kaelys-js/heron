/**
 * issues.test -- the persistent issue stream + its NEW product-bus emission.
 *
 * R5 contract: after reportIssue() persists to issues.jsonl (+ the db mirror),
 * it ALSO emits ONE product-kind bus event so the persisted problem pings the
 * bell over the SSE stream. WHY it matters: a product issue (failed apply,
 * dead posting) is exactly the kind of thing the user must be told about
 * loudly -- persisting it silently would leave the bell dark. The emission
 * must be product-kind so the bell-gating ($lib/report-routing) lets it
 * through, exactly once per reportIssue (not once per write-path branch).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

// fs spies -- keep issues.jsonl writes off the real disk. Reads pass through
// existsSync -> false so readAll() returns [] (no prior issues in CI).
vi.spyOn(fs, 'appendFileSync').mockImplementation(() => undefined);
vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as unknown as string);
vi.spyOn(fs, 'existsSync').mockReturnValue(false);

let __currentUserId: string | null = null;
const SYSTEM_USER_ID_LOCAL = '00000000-0000-0000-0000-000000000000';
vi.mock('./user-context', () => ({
  SYSTEM_USER_ID: SYSTEM_USER_ID_LOCAL,
  maybeCurrentUserId: () => __currentUserId,
}));

vi.mock('./db-writers', () => ({
  dbWriteIssue: vi.fn(),
}));

// Mock the events module so the lazy `require('./events')` inside reportIssue
// resolves to a spy we can assert -- decoupled from the bus singleton, this
// directly verifies "one product event emitted per reportIssue".
const logEventMock = vi.fn();
vi.mock('./events', () => ({
  logEvent: (...args: unknown[]) => logEventMock(...args),
}));

const { reportIssue } = await import('./issues');

// The bus emit is a fire-and-forget dynamic import (so the Issue write never
// waits on the bell). Loading a module is more than a microtask, so yield a
// real macrotask before asserting the emit fired.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  __currentUserId = null;
  logEventMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('reportIssue — persistence still happens', () => {
  it('writes the issue on the append path (no dedupeKey)', () => {
    const issue = reportIssue({ severity: 'error', source: 'apply', summary: 'Apply failed' });
    expect(issue.id).toBeTruthy();
    expect(issue.summary).toBe('Apply failed');
    expect(fs.appendFileSync).toHaveBeenCalled();
    const payload = String((fs.appendFileSync as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]);
    expect(payload).toContain('Apply failed');
  });

  it('writes the issue on the dedupe path (writeAll)', () => {
    reportIssue({
      severity: 'warn',
      source: 'liveness',
      summary: 'Posting went dead',
      dedupeKey: 'liveness:job-1',
    });
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});

describe('reportIssue — product bus emission (R5)', () => {
  function emittedOpts(): Record<string, unknown> {
    return logEventMock.mock.calls.at(-1)?.[2] as Record<string, unknown>;
  }

  it('emits exactly ONE bus event (append path)', async () => {
    reportIssue({ severity: 'error', source: 'apply', summary: 'Apply failed' });
    await flush();
    expect(logEventMock).toHaveBeenCalledTimes(1);
  });

  it('emits exactly ONE bus event (dedupe path -- not one per branch)', async () => {
    reportIssue({
      severity: 'error',
      source: 'apply',
      summary: 'Apply failed again',
      dedupeKey: 'apply:job-2',
    });
    await flush();
    expect(logEventMock).toHaveBeenCalledTimes(1);
  });

  it('emits as product-kind, category application, level = severity', async () => {
    reportIssue({
      severity: 'warn',
      source: 'integrity',
      summary: 'Pipeline integrity finding',
      detail: 'two rows for the same company+role',
    });
    await flush();
    const [source, title, opts] = logEventMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(source).toBe('integrity');
    expect(title).toBe('Pipeline integrity finding');
    expect(opts.kind).toBe('product');
    expect(opts.category).toBe('application');
    expect(opts.level).toBe('warn'); // mirrors the issue severity
    expect(opts.message).toBe('two rows for the same company+role');
  });

  it('carries the resolved user scope so the SSE per-user filter shows it', async () => {
    __currentUserId = '11111111-1111-1111-1111-111111111111';
    reportIssue({ severity: 'error', source: 'apply', summary: 'scoped' });
    await flush();
    expect(emittedOpts().userId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('a system-wide issue (userId:null) emits a broadcast event (userId:null)', async () => {
    __currentUserId = 'als-uid';
    reportIssue({ severity: 'error', source: 'apply', summary: 'broadcast', userId: null });
    await flush();
    expect(emittedOpts().userId).toBeNull();
  });

  it('the issue is still returned even if the bus emit throws (best-effort)', async () => {
    logEventMock.mockImplementationOnce(() => {
      throw new Error('bus down');
    });
    const issue = reportIssue({ severity: 'error', source: 'apply', summary: 'resilient' });
    await flush();
    expect(issue.summary).toBe('resilient');
  });
});
