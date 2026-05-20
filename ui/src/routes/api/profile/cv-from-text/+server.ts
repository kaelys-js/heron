/** POST /api/profile/cv-from-text -- plain-text resume → canonical markdown CV
 *  (Summary/Experience/Projects/Education/Skills, ATS-friendly bullets).
 *  Distinct from /api/profile/reprocess which extracts structured fields
 *  from an existing markdown CV. Onboarding calls this first when the user
 *  pastes text, then optionally reprocess once cv.md is written.
 *  Body: { text }. Reply: { markdown }. Cost: ~$0.10-0.40 Anthropic. */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { complete } from '$lib/server/ai';
import { logEvent } from '$lib/server/events';

const SYSTEM_PROMPT =
  'You are converting a plain-text CV into clean, ATS-friendly markdown.\n\n' +
  'OUTPUT FORMAT:\n' +
  'Return ONLY the markdown body — no code fences, no commentary, no preamble.\n' +
  'The CV must use these sections in this order (omit a section entirely if the source has nothing for it):\n' +
  '  # {Full Name}\n' +
  '  {one-line headline · email · phone · city, country · linkedin/github}\n\n' +
  '  ## Summary\n' +
  '  3–5 sentence professional summary.\n\n' +
  '  ## Experience\n' +
  '  ### {Role} — {Company} ({start} – {end or Present})\n' +
  '  - Bullet describing impact with a metric where possible.\n' +
  '  - More bullets…\n\n' +
  '  ## Projects\n' +
  '  ### {Project name}\n' +
  '  - What it is, what was shipped, metric.\n\n' +
  '  ## Education\n' +
  '  - {Degree}, {Institution} ({year})\n\n' +
  '  ## Skills\n' +
  '  - **{Category}:** comma-separated list\n\n' +
  'RULES:\n' +
  '- Preserve EVERY fact from the source — do not summarize, drop, or invent. If the source mentions 12 jobs you output 12 jobs.\n' +
  '- Convert bullet-y prose into actual `-` bullets. Each bullet on its own line.\n' +
  '- Lead with the strongest verb + outcome. Drop fluff ("responsible for", "tasked with").\n' +
  '- Keep the original metrics verbatim — never round, never invent.\n' +
  "- If a date range is implied but unclear, write the source's wording verbatim instead of guessing.\n" +
  '- If contact details are missing leave the header line as just the name + headline.\n' +
  '- No emojis, no horizontal rules, no tables. Plain markdown headings + lists only.';

export const POST = wrap('cv-from-text', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  if (!body || typeof body.text !== 'string') {
    badRequest('expected JSON body with { text: string }');
  }
  const text = body.text.trim();
  if (!text) badRequest('text is empty');
  if (text.length < 50) badRequest('text too short to be a CV (need at least 50 characters)');
  if (text.length > 200_000) badRequest('text too long (>200k chars) — trim it before submitting');

  logEvent('cv-from-text', 'Converting plain-text CV to markdown', {
    category: 'user',
    message: text.length.toLocaleString() + ' chars · model=claude-opus-4-7',
  });

  const out = await complete(SYSTEM_PROMPT, text, { maxTokens: 8000, thinking: false });

  // Strip code fences if Claude added them despite the instruction.
  const markdown = out
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  if (!markdown)
    badRequest('Claude returned an empty response — try again or paste markdown directly');

  logEvent('cv-from-text', 'Plain-text CV converted', {
    level: 'success',
    category: 'user',
    message:
      text.length.toLocaleString() +
      ' chars in → ' +
      markdown.length.toLocaleString() +
      ' chars out',
  });

  return { markdown };
});
