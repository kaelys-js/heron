/**
 * POST /api/profile/cv-from-linkedin
 *
 * Reads a LinkedIn profile URL, extracts its visible text via the saved
 * Playwright session (.playwright-linkedin/), and converts the result into
 * canonical markdown CV sections via Claude.
 *
 * Why authenticated-only: LinkedIn aggressively blocks public scraping of
 * profile pages (auth-walls, JS-only rendering, IP rate-limits). The user's
 * saved session bypasses every one of those -- same view they'd see when
 * visiting the URL themselves. Public scraping reliably fails so we don't
 * even attempt it.
 *
 * Pre-condition: the user has connected LinkedIn from /sources or the
 * onboarding wizard's Sources step. Otherwise we 400 with a clear hint.
 *
 * Request:  { url: string }
 * Response: { markdown: string }
 *
 * Cost: 1 Anthropic call (~$0.10-$0.40 depending on profile length) +
 * a few seconds of headless Playwright.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { complete } from '$lib/server/ai';
import { getSource } from '$lib/server/sources';
import { logEvent } from '$lib/server/events';
import { ROOT } from '$lib/server/files';
import { userContextEnv } from '$lib/server/user-context';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const SYSTEM_PROMPT =
  'You are converting raw LinkedIn profile text into clean, ATS-friendly markdown CV.\n\n' +
  'INPUT: visible text scraped from a LinkedIn profile page. Sections may include: name + ' +
  'headline at the top, About, Experience (multiple roles, each with title / company / dates / ' +
  'description bullets), Education, Skills, Licenses & Certifications, Projects, Volunteer, ' +
  'Honors, Languages. The text may have minor scraping artifacts (LinkedIn UI labels like ' +
  '"see more", duplicate role titles, "Show all X experiences" etc).\n\n' +
  'OUTPUT FORMAT:\n' +
  'Return ONLY the markdown body — no code fences, no commentary, no preamble. Use:\n' +
  '  # {Full Name}\n' +
  '  {one-line headline · location · linkedin url if present}\n\n' +
  '  ## Summary\n' +
  '  3–5 sentence summary derived from About + headline.\n\n' +
  '  ## Experience\n' +
  '  ### {Role} — {Company} ({start} – {end or Present})\n' +
  '  - Bullet describing impact with metric where present in source.\n\n' +
  '  ## Projects\n' +
  '  (only if profile has Projects section)\n\n' +
  '  ## Education\n' +
  '  - {Degree}, {Institution} ({year range})\n\n' +
  '  ## Skills\n' +
  '  - **{Category}:** comma-separated (group by theme: languages, infra, AI, soft, etc.)\n\n' +
  '  ## Certifications\n' +
  '  (only if Licenses & Certifications has any)\n\n' +
  'RULES:\n' +
  '- Preserve EVERY role / education entry — do not drop, summarize aggressively, or invent.\n' +
  '- Drop LinkedIn UI artifacts: "see more", "show all X", duplicate role titles ' +
  '(LinkedIn renders titles twice in some layouts), "Endorsements", "skill assessment" labels.\n' +
  '- Convert prose-like Experience descriptions into discrete `-` bullets when natural.\n' +
  '- Lead bullets with a strong verb. Drop fluff ("responsible for", "tasked with").\n' +
  '- Keep original metrics verbatim — never round, never invent.\n' +
  '- If date range is "X yrs Y mos" without start/end, infer from the order if possible, ' +
  "else write the source's wording verbatim.\n" +
  '- No emojis. No horizontal rules. Plain markdown headings + lists only.';

export const POST = wrap('cv-from-linkedin', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  if (!body || typeof body.url !== 'string') {
    badRequest('expected JSON body with { url: string }');
  }
  const rawUrl = body.url.trim();
  if (!rawUrl) badRequest('url is empty');

  // Cheap shape check up-front so the user gets a fast error before we
  // spawn Playwright. The python script does its own canonicalisation too.
  if (!/(linkedin\.com\/in\/[A-Za-z0-9_\-]+)/i.test(rawUrl)) {
    badRequest(
      'Not a LinkedIn /in/ profile URL — paste a link like https://www.linkedin.com/in/your-handle',
    );
  }

  // The extraction script needs the saved Playwright session. If LinkedIn
  // isn't connected, fail fast with a hint to /sources.
  if (!getSource('linkedin-auth').connected) {
    badRequest(
      "LinkedIn is not connected. Connect it from /sources (or the wizard's Sources step) first — " +
        'we use your authenticated browser session to read the profile, since LinkedIn blocks public scraping.',
    );
  }

  logEvent('cv-from-linkedin', 'Extracting LinkedIn profile via authenticated session', {
    category: 'user',
    message: rawUrl,
  });

  let extracted: string;
  try {
    extracted = await spawnExtractScript(rawUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent('cv-from-linkedin', 'LinkedIn extraction failed', {
      level: 'warn',
      category: 'user',
      message: msg.slice(0, 240),
    });
    badRequest('LinkedIn extraction failed: ' + msg);
  }

  if (!extracted || extracted.length < 200) {
    badRequest(
      'Extracted text is suspiciously short — profile may be private or empty. Paste plain text instead.',
    );
  }

  logEvent('cv-from-linkedin', 'LinkedIn profile extracted, converting via Claude', {
    category: 'user',
    message: extracted.length.toLocaleString() + ' chars · model=claude-opus-4-7',
  });

  const out = await complete(SYSTEM_PROMPT, extracted, { maxTokens: 8000, thinking: false });
  const markdown = out
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  if (!markdown)
    badRequest('Claude returned an empty response — try again or paste plain text directly');

  logEvent('cv-from-linkedin', 'LinkedIn CV import succeeded', {
    level: 'success',
    category: 'user',
    message:
      extracted.length.toLocaleString() +
      ' chars in → ' +
      markdown.length.toLocaleString() +
      ' chars out',
  });

  return { markdown };
});

/** Spawn extract-linkedin-profile.py with the saved venv if present. Resolves
 *  with stdout (the extracted text). Rejects on non-zero exit with the script's
 *  own error message captured from stderr. */
function spawnExtractScript(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const venvPython = ROOT + '/.venv/bin/python';
    const py = fs.existsSync(venvPython) ? venvPython : 'python3';
    const p = spawn(py, ['scripts/linkedin/extract-linkedin-profile.py', '--url', url], {
      cwd: ROOT,
      env: userContextEnv(),
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    // LinkedIn profile pages can run to ~50KB of visible text; cap the
    // accumulated stdout buffer at 1MB to avoid runaway memory if something
    // goes wrong upstream.
    const MAX_BYTES = 1_000_000;
    p.stdout?.on('data', (c: Buffer) => {
      if (stdoutBuf.length < MAX_BYTES) stdoutBuf += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      if (stderrBuf.length < MAX_BYTES) stderrBuf += c.toString();
    });

    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {}
      reject(new Error('Extraction timed out after 60s'));
    }, 60_000);

    p.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(stdoutBuf);
      // Map well-known exit codes to clear user messages -- the script
      // documents these in its docstring.
      const tail = (stderrBuf || '').slice(-400).trim();
      const map: Record<number, string> = {
        2: 'bad arguments to extractor',
        3: 'LinkedIn session expired — reconnect from /sources',
        4: 'profile is private or LinkedIn served an auth-wall',
        5: 'timed out fetching the profile page',
      };
      const hint = map[code ?? -1] ?? 'exited ' + code;
      reject(new Error(hint + (tail ? ' · ' + tail : '')));
    });
  });
}
