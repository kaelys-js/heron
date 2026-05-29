/**
 * POST /api/linkedin/audit/rewrite -- spawn the AI rewrite mode.
 *
 * Post-Option-C: spawn goes through spawnAgentWithMode().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

let nextRun: { stdout: string; exitCode?: number; errors?: Error } = { stdout: '' };

interface SpawnAgentCall {
  modeName: string;
  userMessage: string;
  opts: { profileId: string };
}
const spawnAgentCalls: SpawnAgentCall[] = [];

vi.mock('$lib/server/spawn-agent', () => ({
  spawnAgentWithMode: vi.fn(
    (modeName: string, userMessage: string, opts: SpawnAgentCall['opts']) => {
      const p = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: (sig?: string) => void;
      };
      p.stdout = new EventEmitter();
      p.stderr = new EventEmitter();
      p.kill = () => undefined;
      spawnAgentCalls.push({ modeName, userMessage, opts });
      queueMicrotask(() => {
        if (nextRun.errors) {
          p.emit('error', nextRun.errors);
          return;
        }
        if (nextRun.stdout) {
          p.stdout.emit('data', Buffer.from(nextRun.stdout));
        }
        p.emit('close', nextRun.exitCode ?? 0);
      });
      return { child: p, tempPromptPath: '/tmp/fake.md' };
    },
  ),
}));

vi.mock('$lib/server/files', () => ({ ROOT: '/tmp/repo' }));
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
  spawnAgentCalls.length = 0;
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

describe('pOST /api/linkedin/audit/rewrite', () => {
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
    expect(spawnAgentCalls.length).toBe(0);
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
    // Substituted prompt is now the user-message passed to spawnAgentWithMode.
    const userMsg = spawnAgentCalls[0].userMessage;
    expect(userMsg).toContain('no-headline');
    expect(userMsg).toContain('thin-about');
    expect(userMsg).not.toContain('no-photo');
  });

  it('honours explicit findings array from body', async () => {
    mockReport = {
      findings: [{ kind: 'no-headline' }, { kind: 'thin-about' }],
      snapshot: {},
    };
    nextRun = { stdout: 'REWRITE_PATH: /tmp/r.md\n', exitCode: 0 };
    await post({ findings: ['no-headline'] });
    const userMsg = spawnAgentCalls[0].userMessage;
    expect(userMsg).toContain('no-headline');
    expect(userMsg).not.toContain('thin-about');
  });

  it('spawns with the linkedin-rewrite mode', async () => {
    mockReport = { findings: [{ kind: 'no-headline' }], snapshot: {} };
    nextRun = { stdout: 'REWRITE_PATH: /tmp/r.md\n' };
    await post({});
    expect(spawnAgentCalls[0].modeName).toBe('linkedin-rewrite');
    expect(spawnAgentCalls[0].opts.profileId).toBe('default');
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
