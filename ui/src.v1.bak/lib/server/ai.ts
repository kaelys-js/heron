import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function complete(systemPrompt: string, userMessage: string, opts: { model?: string; maxTokens?: number } = {}): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('ANTHROPIC_API_KEY not set; configure it in Settings');
  const resp = await c.messages.create({
    model: opts.model ?? 'claude-sonnet-4-5-20250929',
    max_tokens: opts.maxTokens ?? 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  const text = resp.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');
  return text;
}

export async function chat(systemPrompt: string, history: { role: 'user' | 'assistant'; content: string }[], opts: { model?: string; maxTokens?: number } = {}): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('ANTHROPIC_API_KEY not set; configure it in Settings');
  const resp = await c.messages.create({
    model: opts.model ?? 'claude-sonnet-4-5-20250929',
    max_tokens: opts.maxTokens ?? 1500,
    system: systemPrompt,
    messages: history,
  });
  const text = resp.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');
  return text;
}
