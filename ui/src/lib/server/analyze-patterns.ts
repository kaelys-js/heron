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
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';

const CACHE_PATH = path.join(ROOT, 'data', 'patterns-cache.json');
const CACHE_TTL_MS = 10 * 60 * 1000;

export type StatsBucket = { avg: number; min: number; max: number; count: number };

export type PatternsResult = {
  metadata?: {
    total: number;
    dateRange: { from: string; to: string };
    analysisDate: string;
    byOutcome: { positive: number; negative: number; self_filtered: number; pending: number };
  };
  funnel?: Record<string, number>;
  scoreComparison?: Record<string, StatsBucket>;
  archetypeBreakdown?: Record<string, { count: number; positive: number; negative: number; positiveRate: number }>;
  blockerAnalysis?: Array<{ blocker: string; frequency: number; percentage: number }>;
  remotePolicy?: Record<string, { count: number; positive: number; positiveRate: number }>;
  companySizeBreakdown?: Record<string, { count: number; positive: number; positiveRate: number }>;
  scoreThreshold?: { suggestedFloor: number; rationale: string };
  techStackGaps?: Array<{ tech: string; freq: number }>;
  recommendations?: string[];
  generatedAt?: number;
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

function spawnAnalyze(): Promise<PatternsResult> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const p = spawn('node', ['analyze-patterns.mjs'], {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    p.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
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
        reject(new Error('Failed to parse analyze-patterns JSON: ' + (err instanceof Error ? err.message : String(err))));
      }
    });
  });
}

export async function getPatterns(opts?: { force?: boolean }): Promise<PatternsResult> {
  if (!opts?.force) {
    const cached = readCache();
    if (cached) return cached;
  }
  const fresh = await spawnAnalyze();
  writeCache(fresh);
  return fresh;
}
