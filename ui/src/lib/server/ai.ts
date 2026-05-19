/**
 * ai.ts -- Anthropic client + completion helpers, scoped per-user.
 *
 * Each user holds their own ANTHROPIC_API_KEY (see user-secrets.ts).
 * `getClient()` resolves the current user via AsyncLocalStorage (the
 * dashboard wraps every request in `runAsUser(uid, ...)` from
 * hooks.server.ts; CLI scripts set `HERON_USER_ID` to drive the
 * same default). The resolver then pulls the user's key from the
 * encrypted secrets store, falling back to `process.env.ANTHROPIC_API_KEY`
 * for legacy single-user installs.
 *
 * SDK clients are memoized by API-KEY VALUE so:
 *   - two users sharing the same key share one HTTP connection pool
 *   - rotating a user's key naturally re-instantiates on next call
 *
 * Callers do NOT pass userId explicitly -- keeping the function shape
 * unchanged so consumers can be migrated without touching their call
 * sites. The implicit lookup is the whole point.
 */
import Anthropic from '@anthropic-ai/sdk';
import { currentUserIdOrDefault } from './user-context';
import { getCredential } from './user-secrets';

const DEFAULT_MODEL = 'claude-opus-4-7';

/** Map from API-KEY VALUE → SDK client. NOT keyed by userId -- two
 *  users sharing the same key share the client (households / shared
 *  Anthropic accounts). */
const clientCache = new Map<string, Anthropic>();

/** Resolve the current user's Anthropic SDK client.
 *
 *  Returns null when neither a per-user nor a process.env key is set.
 *  Callers translate null → "ANTHROPIC_API_KEY not set; configure it
 *  in Settings". */
export function getClient(): Anthropic | null {
  const userId = currentUserIdOrDefault();
  const apiKey = getCredential(userId, 'ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  let c = clientCache.get(apiKey);
  if (!c) {
    c = new Anthropic({ apiKey });
    clientCache.set(apiKey, c);
  }
  return c;
}

/** TEST-ONLY: clear the client cache. Production code never needs this
 *  -- keys rotate naturally on next call (the cache miss instantiates
 *  a fresh client). Exposed so the test suite can isolate cases that
 *  assert on instance-count side-effects. */
export function __resetClientCache(): void {
  clientCache.clear();
}

export async function complete(
  systemPrompt: string,
  userMessage: string,
  opts: { model?: string; maxTokens?: number; thinking?: boolean } = {},
): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('ANTHROPIC_API_KEY not set; configure it in Settings');
  const useThinking = opts.thinking !== false; // default on for complete()
  const params: any = {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  };
  if (
    useThinking &&
    (params.model.includes('opus-4-7') ||
      params.model.includes('opus-4-6') ||
      params.model.includes('sonnet-4-6'))
  ) {
    params.thinking = { type: 'adaptive' };
  }
  const resp = await c.messages.create(params);
  return resp.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');
}

export async function chat(
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  opts: { model?: string; maxTokens?: number; thinking?: boolean } = {},
): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('ANTHROPIC_API_KEY not set; configure it in Settings');
  const params: any = {
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: systemPrompt,
    messages: history,
  };
  // Adaptive thinking opt-in (off by default for chat -- keeps responses snappy)
  if (
    opts.thinking &&
    (params.model.includes('opus-4-7') ||
      params.model.includes('opus-4-6') ||
      params.model.includes('sonnet-4-6'))
  ) {
    params.thinking = { type: 'adaptive' };
  }
  const resp = await c.messages.create(params);
  return resp.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');
}
