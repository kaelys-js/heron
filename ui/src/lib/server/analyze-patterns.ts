/**
 * Pattern-analysis wrapper.
 *
 * Spawns `node analyze-patterns.mjs` (which already returns JSON) and
 * caches the result on disk for ~10 minutes so a noisy reload of
 * /insights doesn't re-run the script unnecessarily.
 *
 * The script reads applications.md and reports/ to compute conversion
 * funnel, score-vs-outcome stats, archetype breakdown, blocker analysis,
 * remote-policy correlation, and recommendations. We just transport its
 * output and let the page render it.
 *
 * IMPORTANT — the type definitions below are the *script's actual JSON
 * shape*, not what felt natural at the time of writing the page. Keys
 * like `total` (not `count`), `conversionRate` (already 0–100, not 0–1),
 * and array-of-objects (not Record<>) are the source of truth. The
 * /insights page reads against these types verbatim.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';

const CACHE_PATH = path.join(ROOT, 'data', 'patterns-cache.json');
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Per-outcome score statistics. `count` is the number of applications in
 *  that outcome bucket; avg/min/max are 0 when count is 0 (script's choice). */
export type StatsBucket = { avg: number; min: number; max: number; count: number };

/** Outcome label as the script tags each application after parsing the tracker. */
export type Outcome = 'positive' | 'negative' | 'self_filtered' | 'pending';

export type ArchetypeRow = {
  archetype: string;
  total: number;
  positive: number;
  negative: number;
  self_filtered: number;
  pending: number;
  /** 0–100 integer percentage (positive / total). NOT 0–1. */
  conversionRate: number;
};

export type RemotePolicyRow = {
  policy: string;
  total: number;
  positive: number;
  negative: number;
  self_filtered: number;
  pending: number;
  conversionRate: number;
};

export type CompanySizeRow = {
  size: string;
  total: number;
  positive: number;
  negative: number;
  self_filtered: number;
  pending: number;
  conversionRate: number;
};

export type Blocker = {
  blocker: string;
  /** Raw count of applications that hit this blocker. */
  frequency: number;
  /** 0–100 integer percentage of all evaluated applications. */
  percentage: number;
};

export type TechGap = {
  /** Tech name as it appeared in the JD (capitalized). */
  skill: string;
  /** How many evaluated applications mentioned this skill in the gaps section. */
  frequency: number;
};

export type Recommendation = {
  /** Imperative one-line action: "Tighten location filters in portals.yml…" */
  action: string;
  /** 1–2 sentences of supporting evidence pulled from the data. */
  reasoning: string;
  /** Used to tint the chip on the page. */
  impact: 'high' | 'medium' | 'low';
};

export type ScoreThreshold = {
  /** Suggested floor (e.g. 3.5) — generate PDFs only at/above this. */
  recommended: number;
  /** Plain-English explanation of why this threshold was chosen. */
  reasoning: string;
  /** "X.X - Y.Y" range string of positive scores, or "N/A". */
  positiveRange: string;
};

export type PatternsResult = {
  metadata?: {
    total: number;
    /** ISO YYYY-MM-DD strings; either may be undefined when no apps tracked. */
    dateRange: { from?: string; to?: string };
    analysisDate: string;
    byOutcome: { positive: number; negative: number; self_filtered: number; pending: number };
  };
  /** Stage label → count. Stages may include status names AND score buckets
   *  (script-level quirk); UI sorts and truncates as appropriate. */
  funnel?: Record<string, number>;
  scoreComparison?: Record<Outcome, StatsBucket>;
  archetypeBreakdown?: ArchetypeRow[];
  blockerAnalysis?: Blocker[];
  remotePolicy?: RemotePolicyRow[];
  companySizeBreakdown?: CompanySizeRow[];
  scoreThreshold?: ScoreThreshold;
  techStackGaps?: TechGap[];
  recommendations?: Recommendation[];
  /** Set by the wrapper, not the script — used to age out the disk cache. */
  generatedAt?: number;
  /** Set by the wrapper when spawn/parse failed — UI surfaces this. */
  error?: string;
};

function readCache(): PatternsResult | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as PatternsResult;
    if (!parsed.generatedAt || Date.now() - parsed.generatedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(r: PatternsResult): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(r, null, 2));
  } catch {
    // best-effort
  }
}

function spawnAnalyze(profileId?: string): Promise<PatternsResult> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const args = ['scripts/tracker/analyze-patterns.mjs'];
    if (profileId) args.push('--profile', profileId);
    const p = spawn('node', args, {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('analyze-patterns.mjs exited ' + code + ': ' + stderr.slice(0, 300)));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as PatternsResult;
        resolve({ ...parsed, generatedAt: Date.now() });
      } catch (err) {
        reject(
          new Error(
            'Failed to parse analyze-patterns JSON: ' +
              (err instanceof Error ? err.message : String(err)),
          ),
        );
      }
    });
  });
}

export async function getPatterns(opts?: {
  force?: boolean;
  profileId?: string;
}): Promise<PatternsResult> {
  if (!opts?.force) {
    const cached = readCache();
    if (cached) return cached;
  }
  const fresh = await spawnAnalyze(opts?.profileId);
  writeCache(fresh);
  return fresh;
}
