/**
 * Aggregate health check — pipeline freshness, key configuration, running tasks.
 *
 * @module
 */

import { wrap } from '$lib/server/api-helpers';
import { listRunning } from '$lib/server/orchestrator';
import { activePath } from '$lib/server/profile-paths';
import fs from 'node:fs';

function stat(p: string): { exists: boolean; size?: number; mtime?: number } {
  try {
    const s = fs.statSync(p);
    return { exists: true, size: s.size, mtime: s.mtimeMs };
  } catch {
    return { exists: false };
  }
}

function countReports(dir: string): number {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

export const GET = wrap('health', async () => {
  const pipeline = stat(activePath('pipeline'));
  const geminiScores = stat(activePath('gemini-scores'));
  const reports = { count: countReports(activePath('reports-dir')) };
  const running = listRunning();
  const stale = pipeline.mtime ? Date.now() - pipeline.mtime > 7 * 24 * 60 * 60 * 1000 : true;
  return {
    pipeline: { ...pipeline, stale },
    reports,
    gemini: {
      scoresExists: geminiScores.exists,
      keyConfigured: !!process.env.GEMINI_API_KEY,
    },
    anthropic: { keyConfigured: !!process.env.ANTHROPIC_API_KEY },
    runningTasks: running,
    lastScanAt: pipeline.mtime ?? null,
  };
});
