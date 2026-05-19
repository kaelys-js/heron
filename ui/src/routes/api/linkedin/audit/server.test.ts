/**
 * GET + POST /api/linkedin/audit -- LinkedIn profile audit.
 *
 * The POST handler spawns linkedin-audit.py; we mock child_process.spawn
 * to drive every branch (success / session-expired / spawn-fail / bad-JSON).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

let nextRun: {
  stdout: string;
  stderr?: string;
  exitCode?: number;
  errors?: Error;
} = { stdout: '' };
const spawnCalls: { bin: string; args: string[] }[] = [];

vi.mock('node:child_process', () => ({
  spawn: vi.fn((bin: string, args: string[]) => {
    const p = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    spawnCalls.push({ bin, args });
    queueMicrotask(() => {
      if (nextRun.errors) {
        p.emit('error', nextRun.errors);
        return;
      }
      if (nextRun.stdout) p.stdout.emit('data', Buffer.from(nextRun.stdout));
      if (nextRun.stderr) p.stderr.emit('data', Buffer.from(nextRun.stderr));
      p.emit('close', nextRun.exitCode ?? 0);
    });
    return p;
  }),
}));

vi.mock('$lib/server/files', () => ({ ROOT: '/tmp/repo' }));

let lastReport: { findings: { resolvedAt?: number }[] } | null = null;
const writeCalls: unknown[] = [];
vi.mock('$lib/server/linkedin-audit', () => ({
  readAuditReport: () => lastReport,
  writeAuditReport: (r: unknown) => {
    writeCalls.push(r);
    lastReport = r as { findings: { resolvedAt?: number }[] };
  },
  classifySnapshot: (snap: Record<string, unknown>) => {
    // Stub classifier -- count of "missing" fields as warnings
    const out: { resolvedAt?: number; severity: string }[] = [];
    if (!snap.profile) out.push({ severity: 'error' });
    return out;
  },
}));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { GET, POST } = await import('./+server');

beforeEach(() => {
  spawnCalls.length = 0;
  writeCalls.length = 0;
  lastReport = null;
  nextRun = { stdout: '' };
});

afterEach(() => {
  vi.clearAllMocks();
});

async function get() {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/linkedin/audit'),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/linkedin/audit'),
    request: new Request('http://localhost/api/linkedin/audit', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('GET /api/linkedin/audit', () => {
  it('returns null when no report has been run', async () => {
    const r = await get();
    expect(r.body.ok).toBe(true);
    expect(r.body.report).toBeNull();
  });

  it('returns the last-saved report when present', async () => {
    lastReport = {
      findings: [],
    };
    const r = await get();
    expect(r.body.report).toEqual(lastReport);
  });
});

describe('POST /api/linkedin/audit', () => {
  it('exit code 1 (session expired) returns helpful error without writing', async () => {
    nextRun = { stdout: '', exitCode: 1 };
    const r = await post({});
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toMatch(/session expired/i);
    expect(writeCalls.length).toBe(0);
  });

  it('exit code 3 (playwright spawn failed) returns helpful error', async () => {
    nextRun = { stdout: '', exitCode: 3 };
    const r = await post({});
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toMatch(/playwright/i);
  });

  it('classifies the snapshot + persists the report on success', async () => {
    nextRun = { stdout: JSON.stringify({ profile: { hasPhoto: true } }), exitCode: 0 };
    const r = await post({});
    expect(r.body.ok).toBe(true);
    expect(r.body.report.findings).toBeDefined();
    expect(writeCalls.length).toBe(1);
  });

  it('grade=100 when there are zero findings', async () => {
    nextRun = { stdout: JSON.stringify({ profile: { hasPhoto: true } }), exitCode: 0 };
    const r = await post({});
    expect(r.body.report.grade).toBe(100);
  });

  it('handles malformed snapshot JSON without crashing', async () => {
    nextRun = { stdout: '!@#$ not-json', exitCode: 0 };
    const r = await post({});
    expect(r.body.ok).toBe(false);
    expect(typeof r.body.error).toBe('string');
  });

  it('passes --headed when body.headed=true', async () => {
    nextRun = { stdout: JSON.stringify({}), exitCode: 0 };
    await post({ headed: true });
    expect(spawnCalls[0].args).toContain('--headed');
  });

  it('omits --headed by default', async () => {
    nextRun = { stdout: JSON.stringify({}), exitCode: 0 };
    await post({});
    expect(spawnCalls[0].args).not.toContain('--headed');
  });
});
