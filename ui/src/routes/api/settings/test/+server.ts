/**
 * Probe a configured provider with a minimal authenticated call to verify
 * the user's key works. Never echoes the key back to the client.
 */
import { wrap, badRequest } from '$lib/server/api-helpers';
import { loadEnv } from '$lib/server/env';
import { logEvent } from '$lib/server/events';
import Anthropic from '@anthropic-ai/sdk';

loadEnv();

type ProbeResult = {
  provider: string;
  ok: boolean;
  message: string;
  info?: Record<string, unknown>;
};

async function probeAnthropic(): Promise<ProbeResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { provider: 'anthropic', ok: false, message: 'No key configured' };
  if (!key.startsWith('sk-ant-')) {
    return { provider: 'anthropic', ok: false, message: 'Key format looks wrong (expected sk-ant-…)' };
  }
  try {
    const client = new Anthropic({ apiKey: key });
    const r = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4,
      messages: [{ role: 'user', content: 'ok' }],
    });
    return {
      provider: 'anthropic',
      ok: true,
      message: 'Connected',
      info: { model: r.model, requestId: (r as any)._request_id ?? null },
    };
  } catch (e: any) {
    return {
      provider: 'anthropic',
      ok: false,
      message: e?.message || 'Anthropic request failed',
      info: { status: e?.status, type: e?.error?.type },
    };
  }
}

async function probeGemini(): Promise<ProbeResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { provider: 'gemini', ok: false, message: 'No key configured' };
  if (!key.startsWith('AIza')) {
    return { provider: 'gemini', ok: false, message: 'Key format looks wrong (expected AIza…)' };
  }
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key);
    const r = await fetch(url, { method: 'GET' });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return {
        provider: 'gemini',
        ok: false,
        message: 'Gemini API rejected the key (' + r.status + ')',
        info: { status: r.status, body: body.slice(0, 200) },
      };
    }
    const j: any = await r.json().catch(() => null);
    const count = Array.isArray(j?.models) ? j.models.length : 0;
    return {
      provider: 'gemini',
      ok: true,
      message: 'Connected · ' + count + ' models available',
      info: { models: count },
    };
  } catch (e: any) {
    return { provider: 'gemini', ok: false, message: e?.message || 'Gemini request failed' };
  }
}

async function probeAdzuna(): Promise<ProbeResult> {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) {
    return { provider: 'adzuna', ok: false, message: 'Both APP_ID and APP_KEY are required' };
  }
  try {
    const url = 'https://api.adzuna.com/v1/api/jobs/ca/search/1?app_id=' + encodeURIComponent(id) + '&app_key=' + encodeURIComponent(key) + '&results_per_page=1&content-type=application/json';
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return {
        provider: 'adzuna',
        ok: false,
        message: 'Adzuna API rejected the credentials (' + r.status + ')',
        info: { status: r.status, body: body.slice(0, 200) },
      };
    }
    const j: any = await r.json().catch(() => null);
    return {
      provider: 'adzuna',
      ok: true,
      message: 'Connected · ' + (j?.count ?? 0).toLocaleString() + ' jobs in CA index',
      info: { count: j?.count ?? 0 },
    };
  } catch (e: any) {
    return { provider: 'adzuna', ok: false, message: e?.message || 'Adzuna request failed' };
  }
}

const PROBES: Record<string, () => Promise<ProbeResult>> = {
  anthropic: probeAnthropic,
  gemini: probeGemini,
  adzuna: probeAdzuna,
};

export const POST = wrap('settings-test', async ({ request }: any) => {
  const body = await request.json().catch(() => null);
  const provider = body?.provider as string | undefined;
  if (!provider || !(provider in PROBES)) {
    badRequest('expected { provider } to be one of: anthropic, gemini, adzuna');
  }
  const result = await PROBES[provider!]();
  logEvent('settings', 'Tested ' + provider, {
    level: result.ok ? 'success' : 'warn',
    category: 'user',
    message: result.message,
  });
  return result as unknown as Record<string, unknown>;
});
