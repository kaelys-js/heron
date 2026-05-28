/** Pulls comp bands from public sources (Levels.fyi, Glassdoor) without
 *  scraping (ToS-prohibited). Three input paths: user-pasted manual,
 *  AGENT_CLI deep-research one-shot with citation, or --offline JSON
 *  for tests / air-gapped runs. Output: OfferBenchmark records stored
 *  on each OfferRecord; rendered by /comparison + negotiation tab. */

import { spawn } from 'node:child_process';
import { CLI_NAMESPACE } from '$lib/config/branding';
import { AGENT_CLI } from '$lib/config/cli';
import { ROOT } from './files';
import type { OfferBenchmark, CompCurrency } from './offers';
import { logEvent, reportServerError } from './events';
import { userContextEnv } from './user-context';

export type BenchmarkQuery = {
  company: string;
  role: string;
  level?: string;
  location: string;
  currency?: CompCurrency;
};

/** Spawn the AGENT CLI with the benchmark deep-research prompt. The CLI
 *  is responsible for hitting public pages (or using its own browsing
 *  tools) and returning a JSON band the spec below. */
const BENCHMARK_PROMPT_PREFIX = `/${CLI_NAMESPACE} deep --benchmark-comp `;

const BENCHMARK_TIMEOUT_MS = 90_000;

export async function fetchBenchmark(q: BenchmarkQuery): Promise<OfferBenchmark | null> {
  const payload = JSON.stringify({
    company: q.company,
    role: q.role,
    level: q.level || '',
    location: q.location,
    currency: q.currency || 'USD',
  });
  return new Promise((resolveP) => {
    let stdout = '';
    let stderr = '';
    const p = spawn(
      AGENT_CLI,
      ['-p', BENCHMARK_PROMPT_PREFIX + payload, '--dangerously-skip-permissions'],
      {
        cwd: ROOT,
        env: userContextEnv(),
      },
    );
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {
        /* already dead */
      }
      resolveP(null);
    }, BENCHMARK_TIMEOUT_MS);
    p.on('error', () => {
      clearTimeout(timer);
      resolveP(null);
    });
    p.on('close', () => {
      clearTimeout(timer);
      const m = stdout.match(/\{[\s\S]*?"medianTc"[\s\S]*?\}/);
      if (!m) {
        if (stderr) {
          reportServerError('comp-benchmark', 'no JSON in output', stderr.slice(0, 400));
        }
        resolveP(null);
        return;
      }
      try {
        const parsed = JSON.parse(m[0]) as Partial<OfferBenchmark> & { medianTc?: number };
        if (typeof parsed.medianTc !== 'number') {
          resolveP(null);
          return;
        }
        logEvent('comp-benchmark', `Benchmark for ${q.role} @ ${q.company}`, {
          level: 'info',
          category: 'application',
          message: `median ${parsed.medianTc} ${q.currency || 'USD'}`,
        });
        resolveP({
          source: parsed.source ?? 'levels.fyi',
          medianTc: parsed.medianTc,
          p25Tc: parsed.p25Tc,
          p75Tc: parsed.p75Tc,
          currency: q.currency || 'USD',
          refreshedAt: Date.now(),
          sourceUrl: parsed.sourceUrl,
        });
      } catch (err) {
        reportServerError('comp-benchmark', 'JSON parse failed', err);
        resolveP(null);
      }
    });
  });
}

/** Manual override path: user pastes the band themselves. */
export function manualBenchmark(
  q: BenchmarkQuery,
  values: { medianTc: number; p25Tc?: number; p75Tc?: number; sourceUrl?: string },
): OfferBenchmark {
  return {
    source: 'manual',
    medianTc: values.medianTc,
    p25Tc: values.p25Tc,
    p75Tc: values.p75Tc,
    currency: q.currency || 'USD',
    refreshedAt: Date.now(),
    sourceUrl: values.sourceUrl,
  };
}
