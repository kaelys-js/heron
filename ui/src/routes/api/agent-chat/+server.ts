/**
 * Agent chat endpoint — wraps Anthropic client with system context.
 *
 * @module
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { chat } from '$lib/server/ai';
import { readSafe, MODES_DIR } from '$lib/server/files';
import { activePath } from '$lib/server/profile-paths';
import { APP_NAME, CLI_NAMESPACE } from '$lib/config/branding';
import fs from 'node:fs';

export const POST = wrap('agent-chat', async ({ request }: { request: Request }) => {
  const body = await request.json().catch(() => ({}));
  const { history, model } = body ?? {};
  if (history != null && !Array.isArray(history)) {
    badRequest('history must be an array', { field: 'history' });
  }
  const cv = readSafe(activePath('cv-md'));
  const profile = readSafe(activePath('profile-yml'));
  let modeList = '';
  try {
    const files: string[] = fs.readdirSync(MODES_DIR);
    modeList = files.filter((f: string) => f.endsWith('.md')).join(', ');
  } catch {}
  let recentReports = '';
  try {
    const files: string[] = fs.readdirSync(activePath('reports-dir'));
    recentReports = files
      .filter((f: string) => f.endsWith('.md'))
      .sort()
      .slice(-5)
      .join(', ');
  } catch {}
  const ns = '/' + CLI_NAMESPACE;
  const sys =
    'You are an autonomous job-search assistant for a senior software engineer. You have access to:\n- Their CV (cv.md)\n- Their profile (config/profile.yml)\n- Available ' +
    APP_NAME +
    ' modes: ' +
    modeList +
    '\n- Recent A-G reports: ' +
    recentReports +
    '\n\nKeep responses concise. When suggesting actions, name the specific ' +
    APP_NAME +
    ' slash command (' +
    ns +
    ' scan, ' +
    ns +
    ' oferta, etc.).\n\n# CV\n' +
    cv.slice(0, 2500) +
    '\n\n# Profile\n' +
    profile.slice(0, 2000);
  const reply = await chat(sys, history ?? [], {
    model: model || 'claude-sonnet-4-6',
    maxTokens: 1500,
  });
  return { reply };
});
