import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const DEFAULT_MODEL = 'claude-opus-4-7';

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
  // Adaptive thinking opt-in (off by default for chat — keeps responses snappy)
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
