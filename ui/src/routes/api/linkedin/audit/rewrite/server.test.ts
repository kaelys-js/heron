/**
 * POST /api/linkedin/audit/rewrite — spawn the AI rewrite mode.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

let nextRun: { stdout: string; exitCode?: number; errors?: Error } = { stdout: '' };
const spawnCalls: { bin: string; args: string[] }[] = [];

vi.mock('node:child_process', () => ({
  spawn: vi.fn((bin: string, args: string[]) => {
    const p = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: (sig?: string) => void;
    };
    p.stdout = new EventEmitter();
    p.stderr = new EventEmitter();
    p.kill = () => undefined;
    spawnCalls.push({ bin, args });
    queueMicrotask(() => {
      if (nextRun.errors) {
        p.emit('error', nextRun.errors);
        return;
      }
      if (nextRun.stdout) p.stdout.emit('data', Buffer.from(nextRun.stdout));
      p.emit('close', nextRun.exitCode ?? 0);
    });
    return p;
  }),
}));

vi.mock('$lib/server/files', () => ({ ROOT: '/tmp/repo' }));

vi.mock('$lib/server/profile-symlinks', () => ({
  swapProfileSymlinks: vi.fn(),
}));

vi.mock('$lib/config/branding', () => ({ CLI_NAMESPACE: 'career-ops' }));
vi.mock('$lib/config/cli', () => ({ AGENT_CLI: 'claude' }));

vi.mock('$lib/server/profiles', () => ({ getActiveProfileId: () => 'default' }));

let mockReport: {
  findings: { kind: string; resolvedAt?: number; settingsPath?: string }[];
  snapshot: Record<string, unknown>;
} | null = null;
vi.mock('$lib/server/linkedin-audit', () => ({
  readAuditReport: () => mockReport,
}));

vi.mock('$lib/server/events', () => ({
  logEvent: vi.fn(),
  reportServerError: vi.fn(),
}));

const { POST } = await import('./+server');

beforeEach(() => {
  nextRun = { stdout: '' };
  spawnCalls.length = 0;
  mockReport = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

async function post(body: unknown) {
  const r = (await (POST as unknown as (e: unknown) => Promise<Response>)({
    url: new URL('http://localhost/api/linkedin/audit/rewrite'),
    request: new Request('http://localhost/api/linkedin/audit/rewrite', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
  } as unknown)) as Response;
  return { status: r.status, body: await r.json() };
}

describe('POST /api/linkedin/audit/rewrite', () => {
  it('returns ok=false when no audit report exists', async () => {
    const r = await post({});
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toMatch(/Run \/api\/linkedin\/audit first/);
  });

  it('returns helpful message when nothing to rewrite (no text findings)', async () => {
    mockReport = {
      findings: [
        { kind: 'no-photo', settingsPath: 'LinkedIn → Profile → Camera' },
        { kind: 'no-2fa', settingsPath: 'Settings → Security' },
      ],
      snapshot: {},
    };
    const r = await post({});
    expect(r.body.ok).toBe(true);
    expect(r.body.message).toMatch(/Nothing to rewrite/);
    expect(spawnCalls.length).toBe(0);
  });

  it('defaults to all unresolved text-fix findings', async () => {
    mockReport = {
      findings: [
        { kind: 'no-headline' },
        { kind: 'thin-about' },
        { kind: 'no-photo', settingsPath: 'LinkedIn → Profile → Camera' },
      ],
      snapshot: {},
    };
    nextRun = { stdout: 'REWRITE_PATH: /tmp/rewrite.md\n', exitCode: 0 };
    const r = await post({});
    expect(r.body.ok).toBe(true);
    expect(r.body.rewritePath).toBe('/tmp/rewrite.md');
    // Spawned with both no-headline + thin-about, but NOT no-photo
    const prompt = spawnCalls[0].args[1];
    expect(prompt).toContain('no-headline');
    expect(prompt).toContain('thin-about');
    expect(prompt).not.toContain('no-photo');
  });

  it('honours explicit findings array from body', async () => {
    mockReport = {
      findings: [{ kind: 'no-headline' }, { kind: 'thin-about' }],
      snapshot: {},
    };
    nextRun = { stdout: 'REWRITE_PATH: /tmp/r.md\n', exitCode: 0 };
    await post({ findings: ['no-headline'] });
    const prompt = spawnCalls[0].args[1];
    expect(prompt).toContain('no-headline');
    expect(prompt).not.toContain('thin-about');
  });

  it('spawns AGENT_CLI with the rewrite prompt prefix', async () => {
    mockReport = { findings: [{ kind: 'no-headline' }], snapshot: {} };
    nextRun = { stdout: 'REWRITE_PATH: /tmp/r.md\n' };
    await post({});
    expect(spawnCalls[0].bin).toBe('claude');
    expect(spawnCalls[0].args[1]).toContain('/career-ops linkedin-rewrite');
  });

  it('catches non-zero exit + returns ok=false (does NOT propagate as 5xx)', async () => {
    mockReport = { findings: [{ kind: 'no-headline' }], snapshot: {} };
    nextRun = { stdout: '', exitCode: 1 };
    const r = await post({});
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toMatch(/exited 1/);
  });
});
