/** Tests for ai.ts: per-user credential resolution + SDK memoization.
 *  Anthropic SDK mocked at the module boundary (no real network). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { tmpdir } from 'node:os';

const TMP = path.join(tmpdir(), 'heron-ai-test-' + Date.now() + '-' + process.pid);

vi.mock('./files', () => ({ ROOT: TMP, DATA_ROOT: path.join(TMP, 'data'), readSafe: () => '' }));

// Track instantiations so we can assert client memoization works correctly.
const instances: Array<{ apiKey: string; createCalls: any[] }> = [];

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class FakeAnthropic {
      apiKey: string;
      createCalls: any[] = [];
      messages: {
        create: (p: any) => Promise<{ content: Array<{ type: string; text: string }> }>;
      };
      constructor(opts: { apiKey: string }) {
        this.apiKey = opts.apiKey;
        instances.push(this);
        // bind `this` lexically -- the SDK lets you pull `messages.create`
        // off the instance, so the fake needs the same shape.
        const self = this;
        this.messages = {
          create: async (p: any) => {
            self.createCalls.push(p);
            return {
              content: [{ type: 'text', text: `fake-reply for ${self.apiKey.slice(0, 8)}` }],
            };
          },
        };
      }
    },
  };
});

const { setSecret } = await import('./user-secrets');
const { runAsUser, SYSTEM_USER_ID } = await import('./user-context');
const { complete, chat, getClient, __resetClientCache } = await import('./ai');

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = 'a'.repeat(64);
  delete process.env.ANTHROPIC_API_KEY;
  instances.length = 0;
  __resetClientCache();
});

afterEach(async () => {
  const fs = await import('node:fs');
  if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
});

describe('ai.ts — getClient() per-user resolution', () => {
  it('returns null when no key in user-store nor env', async () => {
    await runAsUser(USER_A, async () => {
      expect(getClient()).toBeNull();
    });
  });

  it('uses the per-user key when set', async () => {
    setSecret(USER_A, 'ANTHROPIC_API_KEY', 'sk-ant-user-a');
    await runAsUser(USER_A, async () => {
      const c = getClient();
      expect(c).not.toBeNull();
      expect((c as any).apiKey).toBe('sk-ant-user-a');
    });
  });

  it('falls back to process.env when no per-user key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env';
    await runAsUser(USER_A, async () => {
      const c = getClient();
      expect((c as any).apiKey).toBe('sk-env');
    });
  });

  it('per-user key beats process.env', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env-loses';
    setSecret(USER_A, 'ANTHROPIC_API_KEY', 'sk-user-wins');
    await runAsUser(USER_A, async () => {
      const c = getClient();
      expect((c as any).apiKey).toBe('sk-user-wins');
    });
  });

  it('two users with different keys get different clients', async () => {
    setSecret(USER_A, 'ANTHROPIC_API_KEY', 'sk-a');
    setSecret(USER_B, 'ANTHROPIC_API_KEY', 'sk-b');
    await runAsUser(USER_A, async () => {
      expect((getClient() as any).apiKey).toBe('sk-a');
    });
    await runAsUser(USER_B, async () => {
      expect((getClient() as any).apiKey).toBe('sk-b');
    });
    expect(instances.length).toBe(2);
  });

  it('two users with the SAME key share one client (memoized by key)', async () => {
    setSecret(USER_A, 'ANTHROPIC_API_KEY', 'sk-shared');
    setSecret(USER_B, 'ANTHROPIC_API_KEY', 'sk-shared');
    await runAsUser(USER_A, async () => {
      getClient();
    });
    await runAsUser(USER_B, async () => {
      getClient();
    });
    expect(instances.length).toBe(1);
  });
});

describe('ai.ts — complete() + chat() error path', () => {
  it('complete() throws when no key configured', async () => {
    await runAsUser(USER_A, async () => {
      await expect(complete('sys', 'msg')).rejects.toThrow(/ANTHROPIC_API_KEY/);
    });
  });

  it('chat() throws when no key configured', async () => {
    await runAsUser(USER_A, async () => {
      await expect(chat('sys', [])).rejects.toThrow(/ANTHROPIC_API_KEY/);
    });
  });

  it('complete() routes through the per-user client', async () => {
    setSecret(USER_A, 'ANTHROPIC_API_KEY', 'sk-a');
    setSecret(USER_B, 'ANTHROPIC_API_KEY', 'sk-b');
    await runAsUser(USER_A, async () => {
      const out = await complete('sys', 'msg');
      expect(out).toBe('fake-reply for sk-a'); // fake takes apiKey.slice(0,8); 'sk-a' is 4 chars
    });
    // The two userspaces must NOT have crossed: each one's createCalls
    // appears on its own client instance.
    const byKey: Record<string, any[]> = {};
    for (const i of instances) byKey[i.apiKey] = i.createCalls;
    expect(byKey['sk-a']).toHaveLength(1);
    expect(byKey['sk-b']).toBeUndefined();
  });

  it('complete() falls back to env when SYSTEM user calls (no per-user)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env-system';
    await runAsUser(SYSTEM_USER_ID, async () => {
      const out = await complete('sys', 'msg');
      expect(out).toBe('fake-reply for sk-env-s'); // apiKey.slice(0,8) of 'sk-env-system' = 'sk-env-s'
    });
  });
});
