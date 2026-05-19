/**
 * Real runtime/integration health probes for the Runtimes page.
 *
 * Every value here is observed live from the system -- no static "looks healthy" cards.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { readEnv } from './env';
import { bus, logEvent } from './events';
import { listRunning } from './orchestrator';
import { currentUserIdOrDefault } from './user-context';
import type { ActivityEvent } from '$lib/types';

export type RuntimeStatus = 'healthy' | 'degraded' | 'down' | 'unconfigured';
export type RuntimeKind = 'runtime' | 'integration';

export type RuntimeCard = {
  id: string;
  name: string;
  kind: RuntimeKind;
  required: boolean;
  status: RuntimeStatus;
  /** One-line identity (e.g. "v25.9.0", "****abc1") shown next to the name */
  badge?: string;
  /** Multi-line details: rendered as small dimmed lines under the title */
  details: string[];
  /** Concrete features this runtime enables. Drives the "what breaks if missing" list. */
  powers: string[];
  /** Recent invocation count (last 24h) and timestamp of most recent invocation */
  usage?: {
    last24h: number;
    lastUsedAt: number | null;
    /** Most recent error related to this runtime, if any (within last 24h) */
    lastError?: { ts: number; title: string; message?: string };
  };
  /** If true, dashboard renders a "Test connection" button calling /api/settings/test */
  probable?: 'anthropic' | 'gemini' | 'adzuna';
  /** When unconfigured, link to a setup destination */
  setupUrl?: string;
  setupLabel?: string;
};

export type RuntimeReport = {
  generatedAt: number;
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unconfigured: number;
    requiredHealthy: boolean;
    runningTasks: string[];
  };
  cards: RuntimeCard[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function readPackageJson(): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  try {
    const txt = fs.readFileSync(path.join(ROOT, 'ui', 'package.json'), 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    logEvent('runtime-info', 'Failed to read ui/package.json', {
      level: 'warn',
      category: 'system',
      message: e instanceof Error ? e.message : String(e),
    });
    return {};
  }
}

function detectPython(): {
  exists: boolean;
  version?: string;
  sitePackagesPath?: string;
  packagesCount?: number;
  hasJobspy: boolean;
  hasPlaywright: boolean;
  hasGoogleGenAI: boolean;
} {
  const venv = path.join(ROOT, '.venv');
  if (!fs.existsSync(venv)) {
    return { exists: false, hasJobspy: false, hasPlaywright: false, hasGoogleGenAI: false };
  }
  // Find python version by listing .venv/lib/
  let version: string | undefined;
  let sitePackagesPath: string | undefined;
  try {
    const libDir = path.join(venv, 'lib');
    const entries = fs.readdirSync(libDir);
    const py = entries.find((e: string) => /^python\d+\.\d+/.test(e));
    if (py) {
      version = py.replace('python', '');
      sitePackagesPath = path.join(libDir, py, 'site-packages');
    }
  } catch (e) {
    // .venv exists but lib/ is unreadable -- corrupt venv. Surface so the
    // user knows why the Runtimes page shows "unconfigured" despite a venv.
    logEvent('runtime-info', 'Could not read .venv/lib', {
      level: 'warn',
      category: 'system',
      message: e instanceof Error ? e.message : String(e),
    });
  }

  let packagesCount = 0;
  let hasJobspy = false;
  let hasPlaywright = false;
  let hasGoogleGenAI = false;

  if (sitePackagesPath) {
    try {
      const items = fs.readdirSync(sitePackagesPath);
      // Count "real" packages: dist-info dirs (one per installed package)
      const distInfos = items.filter((n: string) => n.endsWith('.dist-info'));
      packagesCount = distInfos.length;
      const lower = items.map((n: string) => n.toLowerCase());
      hasJobspy = lower.some((n) => n.startsWith('python_jobspy') || n === 'jobspy');
      hasPlaywright =
        lower.includes('playwright') || lower.some((n) => n.startsWith('playwright-'));
      hasGoogleGenAI = lower.some(
        (n) =>
          n.includes('google_ai_generativelanguage') ||
          n.includes('google_genai') ||
          n.includes('google-generativeai'),
      );
    } catch (e) {
      logEvent('runtime-info', 'Could not read site-packages', {
        level: 'warn',
        category: 'system',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    exists: true,
    version,
    sitePackagesPath,
    packagesCount,
    hasJobspy,
    hasPlaywright,
    hasGoogleGenAI,
  };
}

function maskKey(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (v.length < 8) return '****';
  return '****' + v.slice(-4);
}

function eventsInWindow(predicate: (ev: ActivityEvent) => boolean): {
  last24h: number;
  lastUsedAt: number | null;
  lastError?: ActivityEvent;
} {
  const cutoff = Date.now() - DAY_MS;
  let count = 0;
  let lastUsed: number | null = null;
  let lastError: ActivityEvent | undefined;
  // F25 -- scope to the calling user. /runtimes is the consumer; it runs
  // inside a user request context so currentUserIdOrDefault resolves
  // correctly. Pre-fix this counted user A's anthropic API errors
  // against user B's "last 24h" stats.
  for (const ev of bus.recentForUser(currentUserIdOrDefault())) {
    if (!predicate(ev)) continue;
    if (ev.ts < cutoff) continue;
    count++;
    if (lastUsed == null || ev.ts > lastUsed) lastUsed = ev.ts;
    if (ev.level === 'error' && (!lastError || ev.ts > lastError.ts)) lastError = ev;
  }
  return { last24h: count, lastUsedAt: lastUsed, lastError };
}

export function buildRuntimeReport(): RuntimeReport {
  const env = readEnv();
  const pkg = readPackageJson();
  const py = detectPython();
  const cards: RuntimeCard[] = [];

  // ----- Node.js -----
  const sk = pkg.devDependencies?.['@sveltejs/kit'] ?? '?';
  const vite = pkg.devDependencies?.vite ?? '?';
  const svelte = pkg.devDependencies?.svelte ?? '?';
  cards.push({
    id: 'node',
    name: 'Node.js',
    kind: 'runtime',
    required: true,
    status: 'healthy',
    badge: process.version,
    details: [
      'SvelteKit ' + sk + ' · Svelte ' + svelte + ' · Vite ' + vite,
      'PID ' +
        process.pid +
        ' · ' +
        process.platform +
        '/' +
        process.arch +
        ' · uptime ' +
        Math.round(process.uptime()) +
        's',
    ],
    powers: [
      'Dashboard server (this UI)',
      'API endpoints (/api/*)',
      'Server-sent activity stream',
      'Spawning Python tasks',
    ],
  });

  // ----- Python venv -----
  const pythonRequiredOk = py.exists && py.hasJobspy && py.hasGoogleGenAI;
  const pythonStatus: RuntimeStatus = !py.exists
    ? 'down'
    : pythonRequiredOk
      ? 'healthy'
      : 'degraded';
  const pythonUsage = eventsInWindow(
    (ev) => ev.category === 'task' && ['scan', 'gemini', 'apply-linkedin'].includes(ev.source),
  );
  cards.push({
    id: 'python',
    name: 'Python venv',
    kind: 'runtime',
    required: true,
    status: pythonStatus,
    badge: py.exists ? (py.version ?? 'detected') : 'missing',
    details: py.exists
      ? ([
          (py.packagesCount ?? 0) + ' packages installed',
          'jobspy ' +
            (py.hasJobspy ? '✓' : '✗') +
            ' · playwright ' +
            (py.hasPlaywright ? '✓' : '✗') +
            ' · google-genai ' +
            (py.hasGoogleGenAI ? '✓' : '✗'),
          py.sitePackagesPath ? py.sitePackagesPath.replace(ROOT + '/', '') : '',
        ].filter(Boolean) as string[])
      : [
          'Run: python3 -m venv .venv && .venv/bin/pip install python-jobspy playwright google-generativeai',
        ],
    powers: [
      'Job scanning (scan-broad.py)',
      'Gemini first-pass scoring (gemini-first-pass.py)',
      'LinkedIn Easy Apply (linkedin-easy-apply.py)',
    ],
    usage: {
      last24h: pythonUsage.last24h,
      lastUsedAt: pythonUsage.lastUsedAt,
      lastError: pythonUsage.lastError
        ? {
            ts: pythonUsage.lastError.ts,
            title: pythonUsage.lastError.title,
            message: pythonUsage.lastError.message,
          }
        : undefined,
    },
  });

  // ----- Anthropic Claude -----
  const anthropicConfigured = !!env.ANTHROPIC_API_KEY;
  const anthropicUsage = eventsInWindow(
    (ev) =>
      ev.source === 'agent-chat' ||
      ev.source === 'evaluate' ||
      (ev.source === 'settings' && ev.title.includes('anthropic')),
  );
  cards.push({
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    kind: 'integration',
    required: false,
    status: anthropicConfigured ? 'healthy' : 'unconfigured',
    badge: anthropicConfigured ? maskKey(env.ANTHROPIC_API_KEY) : 'no key',
    details: anthropicConfigured
      ? ['Sonnet 4.6 · Opus 4.7 · Haiku 4.5 (chat default: Sonnet 4.6)']
      : ['Add a key to enable deep evaluation, agent chat, mock interviews, negotiation drafts'],
    powers: [
      'Deep job evaluations (evaluate mode)',
      'Agent chat (bottom-right floating)',
      'Mock interviews & interview prep',
      'Negotiation drafts & comp strategy',
    ],
    usage: {
      last24h: anthropicUsage.last24h,
      lastUsedAt: anthropicUsage.lastUsedAt,
      lastError: anthropicUsage.lastError
        ? {
            ts: anthropicUsage.lastError.ts,
            title: anthropicUsage.lastError.title,
            message: anthropicUsage.lastError.message,
          }
        : undefined,
    },
    probable: 'anthropic',
    setupUrl: '/settings',
    setupLabel: 'Add key in Settings',
  });

  // ----- Gemini -----
  const geminiConfigured = !!env.GEMINI_API_KEY;
  const geminiUsage = eventsInWindow((ev) => ev.source === 'gemini');
  cards.push({
    id: 'gemini',
    name: 'Gemini',
    kind: 'integration',
    required: false,
    status: geminiConfigured ? 'healthy' : 'unconfigured',
    badge: geminiConfigured ? maskKey(env.GEMINI_API_KEY) : 'no key',
    details: geminiConfigured
      ? ['Free-tier Flash (~1M tokens/day) · used for cheap title-based first-pass scoring']
      : [
          'Free key. Without this, jobs land in pipeline unscored — manual Claude eval becomes the only path.',
        ],
    powers: [
      'Cheap first-pass scoring of every pending job (~1 min for 800 jobs)',
      'Cuts Claude evaluation cost by triaging out obvious mismatches',
    ],
    usage: {
      last24h: geminiUsage.last24h,
      lastUsedAt: geminiUsage.lastUsedAt,
      lastError: geminiUsage.lastError
        ? {
            ts: geminiUsage.lastError.ts,
            title: geminiUsage.lastError.title,
            message: geminiUsage.lastError.message,
          }
        : undefined,
    },
    probable: 'gemini',
    setupUrl: '/settings',
    setupLabel: 'Add key in Settings',
  });

  // ----- Adzuna (optional) -----
  const adzunaConfigured = !!env.ADZUNA_APP_ID && !!env.ADZUNA_APP_KEY;
  cards.push({
    id: 'adzuna',
    name: 'Adzuna',
    kind: 'integration',
    required: false,
    status: adzunaConfigured ? 'healthy' : 'unconfigured',
    badge: adzunaConfigured ? maskKey(env.ADZUNA_APP_KEY) : 'no keys',
    details: adzunaConfigured
      ? ['Free tier: 1,000 calls/month. Adds ~150 jobs per scan.']
      : ['Optional. The scanner skips Adzuna if not configured — the other 6 sources still run.'],
    powers: [
      'Adds Adzuna as an additional source in scan-broad.py',
      '~150 extra jobs/scan (CA + US senior-engineer queries)',
    ],
    probable: 'adzuna',
    setupUrl: '/settings',
    setupLabel: 'Add keys in Settings',
  });

  // ----- Summary -----
  const requiredCards = cards.filter((c) => c.required);
  const requiredHealthy = requiredCards.every((c) => c.status === 'healthy');
  const summary = {
    total: cards.length,
    healthy: cards.filter((c) => c.status === 'healthy').length,
    degraded: cards.filter((c) => c.status === 'degraded' || c.status === 'down').length,
    unconfigured: cards.filter((c) => c.status === 'unconfigured').length,
    requiredHealthy,
    runningTasks: listRunning(),
  };

  return {
    generatedAt: Date.now(),
    summary,
    cards,
  };
}
