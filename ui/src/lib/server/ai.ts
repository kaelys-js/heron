/** Per-user Anthropic client + completion helpers. getClient() resolves
 *  current user via AsyncLocalStorage (request scope) or HERON_USER_ID
 *  (CLI), pulls their ANTHROPIC_API_KEY from user-secrets, falls back
 *  to process.env for legacy single-user. SDK clients memoized by
 *  key VALUE so shared keys pool their HTTP connections + rotation
 *  re-instantiates on next call. Callers do not pass userId -- implicit
 *  resolution is the entire point. */
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
