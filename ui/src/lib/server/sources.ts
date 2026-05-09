/**
 * Source connection state — single source of truth for which scanners are
 * connected, when they last ran, and how often they fail.
 *
 * Distinct from the activity feed (transient log) and the `data/issues.jsonl`
 * issue stream (operational alerts). This is per-source health, written by
 * each scanner JobDef on every run and read by the /sources dashboard.
 *
 * State lives at `data/sources.json` — gitignored runtime data, regenerated
 * on demand. Atomic writes via the same write-rename pattern used by other
 * state files in this project.
 *
 *   {
 *     "linkedin-auth": {
 *       "connected": true,
 *       "lastConnectedAt": 1778266000000,
 *       "lastSuccessfulPullAt": 1778355000000,
 *       "consecutiveFailures": 0,
 *       "metadata": { "username": "kaelys-js" }
 *     },
 *     "gmail-imap": { "connected": false, "consecutiveFailures": 3, "lastError": "Auth failed" }
 *   }
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { logEvent, reportServerError } from './events';

const SOURCES_PATH = path.join(ROOT, 'data', 'sources.json');

/** Threshold: this many consecutive failures flips a source's `connected`
 *  back to false (so the /sources card surfaces the issue). The user
 *  manually clicks Reconnect to recover; we don't auto-reset. */
const FAIL_THRESHOLD = 3;

export type SourceState = {
  connected: boolean;
  /** First successful connect (login/probe). Persists across re-runs. */
  lastConnectedAt?: number;
  /** Most recent successful pull (any non-zero job count or healthy probe). */
  lastSuccessfulPullAt?: number;
  /** Most recent failure message — shown on the /sources card. */
  lastError?: string;
  consecutiveFailures: number;
  /** Per-source metadata (e.g. LinkedIn profile URL after first auth, Gmail
   *  label name). Free-form by design; the consumer of each source decides. */
  metadata?: Record<string, unknown>;
};

/**
 * Canonical registry of every source the dashboard is aware of. The
 * /sources page renders cards from this list (whether or not the user
 * has connected them yet). Order = render order.
 */
export type KnownSource = {
  id: string;
  /** Short label shown on cards. Matches SOURCE_LABELS where applicable. */
  label: string;
  /** One-line description for the card body. */
  description: string;
  /** Connection method — drives which "Connect" UI to render. */
  authKind: 'playwright' | 'imap' | 'env-key' | 'always-on';
  /** Whether this source is essential (LinkedIn / Anthropic) or optional. */
  required: boolean;
};

export const KNOWN_SOURCES: KnownSource[] = [
  {
    id: 'linkedin-auth',
    label: 'LinkedIn (authenticated)',
    description: 'Headless Playwright using your saved LinkedIn session. Catches personalized recommendations + Easy Apply listings JobSpy can\'t see.',
    authKind: 'playwright',
    required: false,
  },
  {
    id: 'indeed-auth',
    label: 'Indeed (authenticated)',
    description: 'Same pattern as LinkedIn — your logged-in session, scraped headlessly. Captures captcha-walled results.',
    authKind: 'playwright',
    required: false,
  },
  {
    id: 'gmail-imap',
    label: 'Gmail (IMAP)',
    description: 'Real-time ingestion of LinkedIn / Indeed / HN job-alert emails. App-password auth, polled every 30 min.',
    authKind: 'imap',
    required: false,
  },
  {
    id: 'anthropic',
    label: 'Anthropic API',
    description: 'Powers deep evaluations, agent chat, mock interviews, negotiation drafts. Required.',
    authKind: 'env-key',
    required: true,
  },
  {
    id: 'gemini',
    label: 'Gemini API',
    description: 'Cheap first-pass scoring (free tier covers ~1M tokens/day). Optional but recommended.',
    authKind: 'env-key',
    required: false,
  },
  {
    id: 'adzuna',
    label: 'Adzuna',
    description: 'Optional aggregator. Adds Adzuna to JobSpy\'s sources when API key is set.',
    authKind: 'env-key',
    required: false,
  },
  {
    id: 'scan-portals',
    label: 'ATS direct (Greenhouse / Ashby / Lever / Workday / SmartRecruiters / Workable / Personio / Recruitee / Teamtailor)',
    description: 'Direct API hits to companies in your portals.yml. Always on.',
    authKind: 'always-on',
    required: false,
  },
  {
    id: 'scan-broad',
    label: 'JobSpy aggregators (LinkedIn / Indeed / Glassdoor / ZipRecruiter / Google Jobs / RemoteOK / WWR / HN / YC)',
    description: 'Broad scrape via JobSpy + free aggregator APIs. Always on.',
    authKind: 'always-on',
    required: false,
  },
  {
    id: 'scan-curated',
    label: 'Curated boards (AI Jobs)',
    description: 'Niche HTML scrapes. Always on.',
    authKind: 'always-on',
    required: false,
  },
];

function ensureDir() {
  try { fs.mkdirSync(path.dirname(SOURCES_PATH), { recursive: true }); } catch {}
}

/** Read the full state map. Returns {} on missing/parse-error so callers
 *  can default per-source. Never throws. */
export function readSources(): Record<string, SourceState> {
  try {
    if (!fs.existsSync(SOURCES_PATH)) return {};
    const txt = fs.readFileSync(SOURCES_PATH, 'utf8');
    if (!txt.trim()) return {};
    const parsed = JSON.parse(txt);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, SourceState>;
    return {};
  } catch (e) {
    reportServerError('sources', 'Failed to read sources.json', e, { category: 'system' });
    return {};
  }
}

/** Get one source's state — returns a zero state when absent (never null). */
export function getSource(id: string): SourceState {
  const all = readSources();
  return all[id] ?? { connected: false, consecutiveFailures: 0 };
}

/** Atomic merge-and-write. */
export function updateSource(id: string, patch: Partial<SourceState>): SourceState {
  ensureDir();
  const all = readSources();
  // Spread defaults first, then prev, then patch — TS doesn't like having
  // explicit named keys *after* a spread that re-supplies them, so we put
  // defaults via the prev/patch chain and assert the result.
  const merged = {
    ...{ connected: false, consecutiveFailures: 0 } as SourceState,
    ...all[id],
    ...patch,
    metadata: { ...(all[id]?.metadata ?? {}), ...(patch.metadata ?? {}) },
  };
  const next: SourceState = merged;
  all[id] = next;
  try {
    fs.writeFileSync(SOURCES_PATH, JSON.stringify(all, null, 2) + '\n');
  } catch (e) {
    reportServerError('sources', 'Failed to write sources.json', e, { category: 'system' });
  }
  return next;
}

/**
 * Mark a successful pull / probe / login. Resets the failure counter and
 * flips `connected: true`. Bumps `lastConnectedAt` only on the first
 * success (so the UI can show "connected since X" without flapping).
 */
export function recordSuccess(id: string, metadata?: Record<string, unknown>): SourceState {
  const prev = getSource(id);
  return updateSource(id, {
    connected: true,
    lastConnectedAt: prev.lastConnectedAt ?? Date.now(),
    lastSuccessfulPullAt: Date.now(),
    lastError: undefined,
    consecutiveFailures: 0,
    metadata: metadata ?? prev.metadata,
  });
}

/**
 * Mark a failure. Increments consecutiveFailures; if we cross
 * FAIL_THRESHOLD, also flips `connected: false` so the /sources card
 * surfaces the disconnect to the user.
 */
export function recordFailure(id: string, error: unknown): SourceState {
  const prev = getSource(id);
  const message = error instanceof Error ? error.message : String(error);
  const next = prev.consecutiveFailures + 1;
  const willDisconnect = next >= FAIL_THRESHOLD && prev.connected;
  if (willDisconnect) {
    logEvent('sources', 'Source disconnected after ' + FAIL_THRESHOLD + ' failures', {
      level: 'warn',
      category: 'system',
      message: id + ' — ' + message,
    });
  }
  return updateSource(id, {
    connected: willDisconnect ? false : prev.connected,
    consecutiveFailures: next,
    lastError: message.slice(0, 500),
  });
}

/**
 * Reset a source's state to zero — used by the /sources page's
 * "Disconnect" button + by `reset onboarding` flows. Distinct from a
 * failure (which keeps history); this wipes everything.
 */
export function resetSource(id: string): void {
  const all = readSources();
  delete all[id];
  ensureDir();
  try {
    fs.writeFileSync(SOURCES_PATH, JSON.stringify(all, null, 2) + '\n');
  } catch (e) {
    reportServerError('sources', 'Failed to reset source', e, { category: 'system' });
  }
}

/** Convenience for /sources page: returns the merged shape for every
 *  KNOWN_SOURCES entry, with default state for any never-connected ones. */
export function listSourcesWithState(): Array<KnownSource & { state: SourceState }> {
  const all = readSources();
  return KNOWN_SOURCES.map((k) => ({
    ...k,
    state: all[k.id] ?? { connected: false, consecutiveFailures: 0 },
  }));
}
