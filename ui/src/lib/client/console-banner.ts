/** Dev-console boot banner + (production) self-XSS warning.
 *
 *  A one-time styled console message printed after hydration. In ALL
 *  environments it surfaces the brand, the exact build (version + git SHA), the
 *  environment, and the repo/docs/community links -- so a developer or support
 *  contact can answer "what build are you on?" straight from the console.
 *
 *  In PRODUCTION it additionally prints a self-XSS / paste-jacking warning (the
 *  GitHub/Discord "Stop!" pattern). Heron stores API keys + can auto-apply on
 *  the user's behalf, so the console is a real social-engineering target; the
 *  warning is suppressed in development so engineers keep a clean console.
 *
 *  `buildConsoleBanner` is the PURE message-builder (unit-tested); the side
 *  effect (reading defines/meta + writing to console, once) lives in
 *  `installConsoleBanner`, called from +layout's onMount.
 */
import { BRAND, DISCORD_URL } from '$lib/client/brand';

export interface ConsoleBannerInput {
  displayName: string;
  tagline: string;
  version: string;
  /** Short git SHA. May be '' on a shallow / non-git build. */
  build: string;
  env: 'development' | 'production';
  homepage: string;
  repoUrl: string;
  discordUrl: string;
  /** Dev-only context (omitted in production). */
  requestId?: string;
  backendUrl?: string;
}

export interface ConsoleCall {
  method: 'log' | 'info' | 'warn';
  args: unknown[];
}

export interface ConsoleBannerOutput {
  calls: ConsoleCall[];
}

// Brand palette (mirrors --accent / --accent-secondary). Inline because the
// console can't read CSS custom properties.
const GOLD = '#c89b4a';
const REED = '#7a8c6d';
const SLATE = '#8b97a6';
const RED = '#e0686f';

/** Build the (pure) list of console calls for the boot banner. */
export function buildConsoleBanner(input: ConsoleBannerInput): ConsoleBannerOutput {
  const { displayName, tagline, version, build, env, homepage, repoUrl, discordUrl } = input;
  const calls: ConsoleCall[] = [];

  // Line 1: brand + tagline.
  calls.push({
    method: 'log',
    args: [
      `%c${displayName}%c  ${tagline}`,
      `color:${GOLD};font-size:20px;font-weight:700;font-family:Georgia,'Times New Roman',serif;`,
      `color:${REED};font-size:12px;font-style:italic;`,
    ],
  });

  // Line 2: exact build identity. Append the SHA only when present.
  const buildSeg = build ? ` · build ${build}` : '';
  calls.push({
    method: 'info',
    args: [
      `%cv${version}${buildSeg} · ${env}`,
      `color:${SLATE};font-size:12px;font-family:ui-monospace,monospace;`,
    ],
  });

  // Line 3: links (devtools auto-linkifies bare URLs).
  calls.push({
    method: 'info',
    args: [
      `%cDocs ${homepage}   ·   Source ${repoUrl}   ·   Community ${discordUrl}`,
      `color:${SLATE};font-size:11px;`,
    ],
  });

  // Line 4 (all envs): point developers + support contacts at the window.heron
  // developer global for build info + safe debug actions. Sits before the prod
  // self-XSS warning so the hint reads as a normal info line, not a scare.
  calls.push({
    method: 'info',
    args: [
      '%cType heron.help() for build info and debug actions.',
      `color:${REED};font-size:11px;`,
    ],
  });

  if (env === 'development') {
    // Dev-only context: the request id (correlation) + resolved backend, when
    // available. Helps a developer tie a page to its server log + confirm which
    // backend the client discovered.
    const bits = [
      input.requestId ? `request-id ${input.requestId}` : '',
      input.backendUrl ? `backend ${input.backendUrl}` : '',
    ].filter(Boolean);
    if (bits.length) {
      calls.push({
        method: 'info',
        args: [
          `%c${bits.join('   ·   ')}`,
          `color:${REED};font-size:11px;font-family:ui-monospace,monospace;`,
        ],
      });
    }
  } else {
    // Production self-XSS / paste-jacking warning.
    calls.push({
      method: 'warn',
      args: [
        '%cStop!',
        `color:${RED};font-size:32px;font-weight:800;-webkit-text-stroke:1px ${RED};`,
      ],
    });
    calls.push({
      method: 'warn',
      args: [
        '%cThis console is a browser feature for developers. If someone told you to copy and ' +
          'paste something here to "unlock a feature" or "fix" your account, it is a scam: pasted ' +
          'code runs with full access to your Heron account, which holds your job data and API keys ' +
          'and can apply to jobs on your behalf. Do not paste code you do not understand.',
        'color:inherit;font-size:14px;line-height:1.5;',
      ],
    });
  }

  return { calls };
}

let installed = false;

/** Print the boot banner exactly once (browser only). Reads the build defines +
 *  the request-id meta, then writes the pure banner to the console. Idempotent
 *  across HMR / re-mounts via a module flag. */
export function installConsoleBanner(): void {
  if (installed || typeof window === 'undefined' || typeof console === 'undefined') {
    return;
  }
  installed = true;

  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
  const build = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '';
  // import.meta.env.DEV is statically replaced by Vite (true in dev, false in
  // the production build), so the prod bundle tree-shakes to env: 'production'.
  const env: 'development' | 'production' = import.meta.env.DEV ? 'development' : 'production';

  let requestId: string | undefined;
  if (env === 'development') {
    requestId =
      document.querySelector('meta[name="x-request-id"]')?.getAttribute('content') ?? undefined;
  }

  const { calls } = buildConsoleBanner({
    displayName: BRAND.displayName,
    tagline: BRAND.tagline,
    version,
    build,
    env,
    homepage: BRAND.repo.homepage,
    repoUrl: BRAND.repo.url,
    discordUrl: DISCORD_URL,
    requestId,
  });

  for (const c of calls) {
    // eslint-disable-next-line no-console
    console[c.method](...c.args);
  }
}
